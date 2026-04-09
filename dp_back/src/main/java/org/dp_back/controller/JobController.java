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
    public ResponseEntity<List<JobResponse>> listJobs() {
        return ResponseEntity.ok(jobService.listJobs());
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

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "ok", "service", "dp_back"));
    }
}
