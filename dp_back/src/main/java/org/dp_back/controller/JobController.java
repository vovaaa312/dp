package org.dp_back.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.dp_back.model.dto.CreateJobRequest;
import org.dp_back.model.dto.JobResponse;
import org.dp_back.service.JobService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/jobs")
@RequiredArgsConstructor
public class JobController {

    private final JobService jobService;

    @PostMapping
    public ResponseEntity<JobResponse> createJob(@Valid @RequestBody CreateJobRequest request, Principal principal) {
        JobResponse response = jobService.createJob(request, principal.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    public ResponseEntity<List<JobResponse>> listJobs(Principal principal) {
        return ResponseEntity.ok(jobService.listJobsForUser(principal.getName()));
    }

    @GetMapping("/{jobId}")
    public ResponseEntity<JobResponse> getJob(@PathVariable String jobId) {
        try {
            return ResponseEntity.ok(jobService.getJob(jobId));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{jobId}")
    public ResponseEntity<JobResponse> stopJob(@PathVariable String jobId) {
        try {
            return ResponseEntity.ok(jobService.stopJob(jobId));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{jobId}/resume")
    public ResponseEntity<JobResponse> resumeJob(@PathVariable String jobId, Principal principal) {
        try {
            return ResponseEntity.ok(jobService.resumeJob(jobId, principal.getName()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.notFound().build();
        }
    }

    @PatchMapping("/{jobId}/name")
    public ResponseEntity<?> renameJob(@PathVariable String jobId,
                                       @RequestBody Map<String, String> body,
                                       Principal principal) {
        String name = body.get("displayName");
        if (name == null || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "displayName is required"));
        }
        try {
            return ResponseEntity.ok(jobService.renameJob(jobId, name.trim(), principal.getName()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
        }
    }

    @DeleteMapping("/{jobId}/model")
    public ResponseEntity<?> deleteModel(@PathVariable String jobId, Principal principal) {
        try {
            jobService.deleteModel(jobId, principal.getName());
            return ResponseEntity.ok(Map.of("message", "Job deleted successfully"));
        } catch (IllegalArgumentException ex) {
            if (ex.getMessage().contains("Not authorized")) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", ex.getMessage()));
            }
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
        }
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "ok", "service", "dp_back"));
    }
}
