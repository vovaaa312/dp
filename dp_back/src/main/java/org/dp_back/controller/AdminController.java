package org.dp_back.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.dp_back.model.Role;
import org.dp_back.model.User;
import org.dp_back.repository.UserRepository;
import org.dp_back.service.BackupService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final UserRepository userRepository;
    private final BackupService backupService;

    // ── User management ──

    @GetMapping("/users")
    public ResponseEntity<List<Map<String, Object>>> listUsers() {
        List<Map<String, Object>> users = userRepository.findAll().stream()
                .map(u -> Map.<String, Object>of(
                        "id", u.getId(),
                        "username", u.getUsername(),
                        "email", u.getEmail(),
                        "role", u.getRole().name(),
                        "createdAt", u.getCreatedAt().toString()
                ))
                .toList();
        return ResponseEntity.ok(users);
    }

    @PatchMapping("/users/{userId}/role")
    public ResponseEntity<?> changeRole(@PathVariable Long userId,
                                        @RequestBody Map<String, String> body,
                                        java.security.Principal principal) {
        String roleStr = body.get("role");
        if (roleStr == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "role is required"));
        }
        Role role;
        try {
            role = Role.valueOf(roleStr.toUpperCase());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid role: " + roleStr));
        }

        return userRepository.findById(userId)
                .map(user -> {
                    if (user.getUsername().equals(principal.getName())) {
                        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                                .body(Map.of("error", "Cannot change your own role"));
                    }
                    user.setRole(role);
                    userRepository.save(user);
                    return ResponseEntity.ok(Map.of("message", "Role updated to " + role.name()));
                })
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found")));
    }

    @DeleteMapping("/users/{userId}")
    public ResponseEntity<?> deleteUser(@PathVariable Long userId) {
        return userRepository.findById(userId)
                .map(user -> {
                    if (user.getRole() == Role.ADMIN) {
                        long adminCount = userRepository.findAll().stream()
                                .filter(u -> u.getRole() == Role.ADMIN)
                                .count();
                        if (adminCount <= 1) {
                            return ResponseEntity.badRequest()
                                    .body(Map.of("error", "Cannot delete the last admin"));
                        }
                    }
                    backupService.deleteUserData(userId);
                    userRepository.deleteById(userId);
                    return ResponseEntity.ok(Map.of("message", "User deleted"));
                })
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found")));
    }

    // ── Backup / Restore ──

    @PostMapping("/backup")
    public ResponseEntity<byte[]> createBackup() {
        try {
            byte[] zipBytes = backupService.createBackup();
            String timestamp = DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss")
                    .withZone(ZoneId.systemDefault())
                    .format(Instant.now());
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=backup_" + timestamp + ".zip")
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .body(zipBytes);
        } catch (Exception e) {
            log.error("Backup failed", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(null);
        }
    }

    @PostMapping("/restore")
    public ResponseEntity<?> restoreBackup(@RequestParam("file") MultipartFile file) {
        try {
            backupService.restoreBackup(file);
            return ResponseEntity.ok(Map.of("message", "Backup restored successfully"));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Restore failed: " + e.getMessage()));
        }
    }
}
