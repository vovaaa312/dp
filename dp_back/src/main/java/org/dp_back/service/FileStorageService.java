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
import java.util.List;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Service
public class FileStorageService {

    private final Path datasetsRoot;
    private final Path uploadsRoot;

    public FileStorageService(@Value("${app.data-dir:/data}") String dataDir) throws IOException {
        this.datasetsRoot = Paths.get(dataDir, "datasets");
        this.uploadsRoot = Paths.get(dataDir, "uploads");
        Files.createDirectories(datasetsRoot);
        Files.createDirectories(uploadsRoot);
    }

    public Path saveDataset(MultipartFile file) throws IOException {
        String originalName = file.getOriginalFilename();
        if (originalName == null || originalName.isBlank()) {
            throw new IllegalArgumentException("File has no name");
        }
        String datasetName = stripExtension(originalName);
        Path datasetDir = datasetsRoot.resolve(datasetName);
        Files.createDirectories(datasetDir);

        if (originalName.toLowerCase().endsWith(".zip")) {
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
        } else {
            Path dest = datasetDir.resolve(originalName);
            file.transferTo(dest.toFile());
        }

        return datasetDir;
    }

    public Path saveUploadedImage(MultipartFile file) throws IOException {
        String originalName = file.getOriginalFilename();
        String ext = (originalName != null && originalName.contains("."))
                ? originalName.substring(originalName.lastIndexOf('.'))
                : ".jpg";
        String uniqueName = System.currentTimeMillis() + ext;
        Path dest = uploadsRoot.resolve(uniqueName);
        file.transferTo(dest.toFile());
        return dest;
    }

    public List<String> listDatasets() throws IOException {
        if (!Files.exists(datasetsRoot)) return List.of();
        try (var stream = Files.list(datasetsRoot)) {
            return stream
                    .filter(Files::isDirectory)
                    .map(p -> p.getFileName().toString())
                    .sorted()
                    .collect(Collectors.toList());
        }
    }

    public String datasetsAbsolutePath(String datasetName) {
        return datasetsRoot.resolve(datasetName).toAbsolutePath().toString();
    }

    private static String stripExtension(String name) {
        int dot = name.lastIndexOf('.');
        return (dot > 0) ? name.substring(0, dot) : name;
    }
}
