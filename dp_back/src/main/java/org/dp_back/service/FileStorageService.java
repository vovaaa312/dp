package org.dp_back.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Service
public class FileStorageService {

    private final Path dataRoot;

    public FileStorageService(@Value("${app.data-dir:/data}") String dataDir) throws IOException {
        this.dataRoot = Paths.get(dataDir);
        Files.createDirectories(dataRoot);
    }

    private Path userDatasetsDir(Long userId) {
        return dataRoot.resolve("users").resolve(String.valueOf(userId)).resolve("datasets");
    }

    private Path userResultsDir(Long userId) {
        return dataRoot.resolve("users").resolve(String.valueOf(userId)).resolve("results");
    }

    private Path userUploadsDir(Long userId) {
        return dataRoot.resolve("users").resolve(String.valueOf(userId)).resolve("uploads");
    }

    public Path saveDataset(MultipartFile file, Long userId) throws IOException {
        String originalName = file.getOriginalFilename();
        if (originalName == null || originalName.isBlank()) {
            throw new IllegalArgumentException("File has no name");
        }
        String datasetName = stripExtension(originalName);
        Path datasetsDir = userDatasetsDir(userId);
        Files.createDirectories(datasetsDir);
        Path datasetDir = datasetsDir.resolve(datasetName);
        Files.createDirectories(datasetDir);

        if (originalName.toLowerCase().endsWith(".zip")) {
            extractZip(file, datasetDir);
        } else {
            Path dest = datasetDir.resolve(originalName);
            file.transferTo(dest.toFile());
        }

        return datasetDir;
    }

    public Path saveUploadedImage(MultipartFile file, Long userId) throws IOException {
        Path uploadsDir = userUploadsDir(userId);
        Files.createDirectories(uploadsDir);
        String originalName = file.getOriginalFilename();
        String ext = (originalName != null && originalName.contains("."))
                ? originalName.substring(originalName.lastIndexOf('.'))
                : ".jpg";
        String uniqueName = System.currentTimeMillis() + ext;
        Path dest = uploadsDir.resolve(uniqueName);
        file.transferTo(dest.toFile());
        return dest;
    }

    public List<String> listDatasets(Long userId) throws IOException {
        Path datasetsDir = userDatasetsDir(userId);
        if (!Files.exists(datasetsDir)) return List.of();
        try (var stream = Files.list(datasetsDir)) {
            return stream
                    .filter(Files::isDirectory)
                    .map(p -> p.getFileName().toString())
                    .sorted()
                    .collect(Collectors.toList());
        }
    }

    public void deleteDataset(Long userId, String datasetName) throws IOException {
        Path datasetPath = userDatasetsDir(userId).resolve(datasetName);
        if (!Files.exists(datasetPath)) {
            throw new IllegalArgumentException("Dataset not found: " + datasetName);
        }
        Files.walk(datasetPath)
                .sorted(Comparator.reverseOrder())
                .forEach(path -> {
                    try {
                        Files.delete(path);
                    } catch (IOException e) {
                        // Silently ignore errors during cleanup
                    }
                });
    }

    public String datasetsAbsolutePath(String datasetName, Long userId) {
        return userDatasetsDir(userId).resolve(datasetName).toAbsolutePath().toString();
    }

    public String resultsAbsolutePath(Long userId) {
        return userResultsDir(userId).toAbsolutePath().toString();
    }

    public void deleteModel(Long userId, String jobId) {
        Path resultsDir = userResultsDir(userId);
        Path jobDir = resultsDir.resolve(jobId);
        if (!Files.exists(jobDir)) {
            return; // No files to delete — that's fine
        }
        try {
            Files.walk(jobDir)
                    .sorted(Comparator.reverseOrder())
                    .forEach(path -> {
                        try {
                            Files.delete(path);
                        } catch (IOException e) {
                            // Silently ignore
                        }
                    });
        } catch (IOException e) {
            // Silently ignore walk errors
        }
    }

    private void extractZip(MultipartFile file, Path datasetDir) throws IOException {
        // First pass: detect if all entries share a single top-level folder
        String topLevelFolder = null;
        boolean hasSingleRoot = true;
        try (InputStream is = file.getInputStream();
             ZipInputStream zis = new ZipInputStream(is)) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                String name = entry.getName().replace("\\", "/");
                String root = name.split("/")[0];
                if (topLevelFolder == null) {
                    topLevelFolder = root;
                } else if (!topLevelFolder.equals(root)) {
                    hasSingleRoot = false;
                    break;
                }
                zis.closeEntry();
            }
        }
        final String stripPrefix = (hasSingleRoot && topLevelFolder != null) ? topLevelFolder + "/" : null;

        // Second pass: actually extract
        try (InputStream is = file.getInputStream();
             ZipInputStream zis = new ZipInputStream(is)) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                String entryName = entry.getName().replace("\\", "/");
                String relative = (stripPrefix != null && entryName.startsWith(stripPrefix))
                        ? entryName.substring(stripPrefix.length())
                        : entryName;
                if (relative.isEmpty()) { zis.closeEntry(); continue; }
                Path target = datasetDir.resolve(relative).normalize();
                if (!target.startsWith(datasetDir)) {
                    throw new IOException("Zip entry outside target dir: " + entryName);
                }
                if (entry.isDirectory()) {
                    Files.createDirectories(target);
                } else {
                    Files.createDirectories(target.getParent());
                    Files.copy(zis, target, StandardCopyOption.REPLACE_EXISTING);
                }
                zis.closeEntry();
            }
        }
    }

    private static String stripExtension(String name) {
        int dot = name.lastIndexOf('.');
        return (dot > 0) ? name.substring(0, dot) : name;
    }
}
