package org.dp_back.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.dp_back.model.dto.DatasetUploadResponse;
import org.dp_back.service.FileStorageService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/datasets")
@RequiredArgsConstructor
public class DatasetController {

    private final FileStorageService fileStorageService;

    @PostMapping("/upload")
    public ResponseEntity<DatasetUploadResponse> uploadDataset(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }
        try {
            Path savedPath = fileStorageService.saveDataset(file);
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
    public ResponseEntity<List<String>> listDatasets() {
        try {
            return ResponseEntity.ok(fileStorageService.listDatasets());
        } catch (IOException ex) {
            log.error("Failed to list datasets: {}", ex.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
