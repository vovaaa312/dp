package org.dp_back.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.dp_back.service.AiClientService;
import org.dp_back.service.FileStorageService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/inference")
@RequiredArgsConstructor
public class InferenceController {

    private final AiClientService aiClientService;
    private final FileStorageService fileStorageService;

    @PostMapping
    public ResponseEntity<Map<?, ?>> runInference(
            @RequestParam("file") MultipartFile file,
            @RequestParam("modelPath") String modelPath,
            @RequestParam(value = "conf", defaultValue = "0.25") double conf
    ) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        try {
            Path savedImage = fileStorageService.saveUploadedImage(file);
            Map<?, ?> result = aiClientService.runInference(
                    savedImage.toAbsolutePath().toString(), modelPath, conf
            );
            return ResponseEntity.ok(result);
        } catch (IOException ex) {
            log.error("Failed to save inference image: {}", ex.getMessage());
            return ResponseEntity.internalServerError().build();
        } catch (RuntimeException ex) {
            log.error("Inference call failed: {}", ex.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Boolean>> aiHealth() {
        return ResponseEntity.ok(Map.of("aiServiceHealthy", aiClientService.isHealthy()));
    }
}
