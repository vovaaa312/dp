package org.dp_back.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.dp_back.model.User;
import org.dp_back.model.dto.DatasetUploadResponse;
import org.dp_back.repository.UserRepository;
import org.dp_back.service.FileStorageService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Path;
import java.security.Principal;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/datasets")
@RequiredArgsConstructor
public class DatasetController {

    private final FileStorageService fileStorageService;
    private final UserRepository userRepository;

    @PostMapping("/upload")
    public ResponseEntity<DatasetUploadResponse> uploadDataset(
            @RequestParam("file") MultipartFile file,
            Principal principal
    ) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }
        Long userId = resolveUserId(principal);
        try {
            Path savedPath = fileStorageService.saveDataset(file, userId);
            String datasetName = savedPath.getFileName().toString();
            return ResponseEntity.status(HttpStatus.CREATED).body(
                    new DatasetUploadResponse(datasetName, savedPath.toAbsolutePath().toString(), file.getSize())
            );
        } catch (IOException ex) {
            log.error("Dataset upload failed: {}", ex.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping
    public ResponseEntity<List<String>> listDatasets(Principal principal) {
        Long userId = resolveUserId(principal);
        try {
            return ResponseEntity.ok(fileStorageService.listDatasets(userId));
        } catch (IOException ex) {
            log.error("Failed to list datasets: {}", ex.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @DeleteMapping("/{datasetName}")
    public ResponseEntity<?> deleteDataset(
            @PathVariable String datasetName,
            Principal principal
    ) {
        Long userId = resolveUserId(principal);
        try {
            fileStorageService.deleteDataset(userId, datasetName);
            return ResponseEntity.ok(java.util.Map.of("message", "Dataset deleted successfully"));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("error", ex.getMessage()));
        } catch (IOException ex) {
            log.error("Failed to delete dataset: {}", ex.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(java.util.Map.of("error", "Failed to delete dataset"));
        }
    }

    private Long resolveUserId(Principal principal) {
        return userRepository.findByUsername(principal.getName())
                .map(User::getId)
                .orElseThrow(() -> new IllegalStateException("User not found: " + principal.getName()));
    }
}
