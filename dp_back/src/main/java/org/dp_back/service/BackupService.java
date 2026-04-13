package org.dp_back.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.dp_back.model.Job;
import org.dp_back.model.User;
import org.dp_back.repository.JobRepository;
import org.dp_back.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

@Slf4j
@Service
public class BackupService {

    private final UserRepository userRepository;
    private final JobRepository jobRepository;
    private final ObjectMapper objectMapper;

    @Value("${app.data-dir:/data}")
    private String dataDir;

    public BackupService(UserRepository userRepository, JobRepository jobRepository, ObjectMapper objectMapper) {
        this.userRepository = userRepository;
        this.jobRepository = jobRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * Create a full backup ZIP containing:
     * - db/users.json   — all users
     * - db/jobs.json    — all jobs
     * - files/          — the entire /data directory (datasets, models, uploads)
     */
    public byte[] createBackup() throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();

        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            // Export users (convert to plain maps to avoid UserDetails serialization issues)
            List<Map<String, Object>> userMaps = userRepository.findAll().stream()
                    .map(u -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("id", u.getId());
                        m.put("username", u.getUsername());
                        m.put("email", u.getEmail());
                        m.put("password", u.getPassword());
                        m.put("role", u.getRole().name());
                        m.put("createdAt", u.getCreatedAt() != null ? u.getCreatedAt().toString() : null);
                        return m;
                    })
                    .toList();
            zos.putNextEntry(new ZipEntry("db/users.json"));
            zos.write(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(userMaps));
            zos.closeEntry();

            // Export jobs
            List<Job> jobs = jobRepository.findAll();
            zos.putNextEntry(new ZipEntry("db/jobs.json"));
            zos.write(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(jobs));
            zos.closeEntry();

            // Export data files
            Path dataPath = Paths.get(dataDir);
            if (Files.exists(dataPath)) {
                try (var walk = Files.walk(dataPath)) {
                    walk.filter(Files::isRegularFile).forEach(file -> {
                        try {
                            String relative = dataPath.relativize(file).toString().replace("\\", "/");
                            zos.putNextEntry(new ZipEntry("files/" + relative));
                            Files.copy(file, zos);
                            zos.closeEntry();
                        } catch (IOException e) {
                            log.warn("Failed to add file to backup: {}", file, e);
                        }
                    });
                }
            }
        }

        log.info("Backup created: {} bytes", baos.size());
        return baos.toByteArray();
    }

    /**
     * Restore a backup ZIP — replaces DB records and data files.
     */
    public void restoreBackup(MultipartFile file) throws IOException {
        try (ZipInputStream zis = new ZipInputStream(file.getInputStream())) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                String name = entry.getName().replace("\\", "/");

                if (name.equals("db/users.json")) {
                    byte[] data = zis.readAllBytes();
                    List<?> rawList = objectMapper.readValue(data, List.class);
                    int count = 0;
                    for (Object raw : rawList) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> m = (Map<String, Object>) raw;
                        String username = (String) m.get("username");
                        if (userRepository.findByUsername(username).isEmpty()) {
                            User u = User.builder()
                                    .username(username)
                                    .email((String) m.get("email"))
                                    .password((String) m.get("password"))
                                    .role(org.dp_back.model.Role.valueOf((String) m.get("role")))
                                    .build();
                            userRepository.save(u);
                            count++;
                        }
                    }
                    log.info("Restored {} users", count);

                } else if (name.equals("db/jobs.json")) {
                    byte[] data = zis.readAllBytes();
                    Job[] jobs = objectMapper.readValue(data, Job[].class);
                    for (Job j : jobs) {
                        if (jobRepository.findById(j.getJobId()).isEmpty()) {
                            jobRepository.save(j);
                        }
                    }
                    log.info("Restored {} jobs", jobs.length);

                } else if (name.startsWith("files/") && !entry.isDirectory()) {
                    String relative = name.substring("files/".length());
                    Path target = Paths.get(dataDir).resolve(relative).normalize();
                    if (!target.startsWith(Paths.get(dataDir))) {
                        log.warn("Skipping unsafe zip entry: {}", name);
                        continue;
                    }
                    Files.createDirectories(target.getParent());
                    Files.copy(zis, target, StandardCopyOption.REPLACE_EXISTING);
                }

                zis.closeEntry();
            }
        }
        log.info("Backup restored successfully");
    }

    /**
     * Delete all data files for a user (called when admin deletes a user).
     */
    public void deleteUserData(Long userId) {
        // Delete user's jobs from DB
        jobRepository.deleteAll(jobRepository.findByUserIdOrderByCreatedAtDesc(userId));

        // Delete user's files from disk
        Path userDir = Paths.get(dataDir).resolve("users").resolve(String.valueOf(userId));
        if (!Files.exists(userDir)) return;
        try {
            Files.walk(userDir)
                    .sorted(Comparator.reverseOrder())
                    .forEach(path -> {
                        try { Files.delete(path); } catch (IOException ignored) {}
                    });
            log.info("Deleted data for user {}", userId);
        } catch (IOException e) {
            log.warn("Failed to fully delete user data for {}: {}", userId, e.getMessage());
        }
    }
}
