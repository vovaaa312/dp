package org.dp_back.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.dp_back.model.Job;
import org.dp_back.model.JobStatus;
import org.dp_back.model.dto.AiJobStatusResponse;
import org.dp_back.model.dto.AiTrainRequest;
import org.dp_back.model.dto.CreateJobRequest;
import org.dp_back.model.dto.JobResponse;
import org.dp_back.repository.JobRepository;
import org.dp_back.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class JobService {

    private final JobRepository jobRepository;
    private final UserRepository userRepository;
    private final AiClientService aiClientService;
    private final FileStorageService fileStorageService;

    @Value("${app.data-dir:/data}")
    private String dataDir;

    public JobResponse createJob(CreateJobRequest request, String username) {
        String jobId = "job-" + UUID.randomUUID().toString().substring(0, 8);

        Long userId = userRepository.findByUsername(username)
                .map(u -> u.getId())
                .orElse(null);

        String datasetPath = fileStorageService.datasetsAbsolutePath(request.getDatasetName());

        AiTrainRequest aiRequest = AiTrainRequest.builder()
                .datasetPath(datasetPath)
                .modelName(request.getModelName())
                .epochs(request.getEpochs())
                .imgsz(request.getImgsz())
                .batch(request.getBatch())
                .runName(jobId)
                .trainerType(request.getTrainerType())
                .build();

        Job job = Job.builder()
                .jobId(jobId)
                .datasetName(request.getDatasetName())
                .modelName(request.getModelName())
                .totalEpochs(request.getEpochs())
                .currentEpoch(0)
                .trainerType(request.getTrainerType())
                .status(JobStatus.PENDING)
                .createdAt(Instant.now())
                .userId(userId)
                .build();

        jobRepository.save(job);

        try {
            aiClientService.startTraining(aiRequest);
            job.setStatus(JobStatus.RUNNING);
            job.setStartedAt(Instant.now());
            jobRepository.save(job);
            log.info("Training job {} started successfully", jobId);
        } catch (Exception ex) {
            job.setStatus(JobStatus.FAILED);
            job.setError(ex.getMessage());
            job.setFinishedAt(Instant.now());
            jobRepository.save(job);
            log.error("Failed to start job {}: {}", jobId, ex.getMessage());
        }

        return toResponse(job);
    }

    public List<JobResponse> listJobs() {
        return jobRepository.findAll().stream()
                .sorted(Comparator.comparing(Job::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public JobResponse getJob(String jobId) {
        Job job = jobRepository.findById(jobId)
                .orElseThrow(() -> new IllegalArgumentException("Job not found: " + jobId));

        if (job.getStatus() == JobStatus.RUNNING || job.getStatus() == JobStatus.PENDING) {
            refreshFromAiService(job);
        }

        return toResponse(job);
    }

    public JobResponse stopJob(String jobId) {
        Job job = jobRepository.findById(jobId)
                .orElseThrow(() -> new IllegalArgumentException("Job not found: " + jobId));

        if (job.getStatus() == JobStatus.RUNNING || job.getStatus() == JobStatus.PENDING) {
            aiClientService.stopJob(jobId);
            job.setStatus(JobStatus.STOPPED);
            job.setFinishedAt(Instant.now());
            jobRepository.save(job);
        }

        return toResponse(job);
    }

    private void refreshFromAiService(Job job) {
        aiClientService.getJobStatus(job.getJobId()).ifPresent(ai -> {
            JobStatus newStatus = parseStatus(ai.getStatus());
            job.setStatus(newStatus);
            job.setCurrentEpoch(ai.getCurrentEpoch());
            job.setMetricsHistory(ai.getMetricsHistory());

            if (ai.getMetrics() != null) {
                Map<String, Double> metrics = new HashMap<>();
                ai.getMetrics().forEach((k, v) -> {
                    if (v instanceof Number num) {
                        metrics.put(k, num.doubleValue());
                    }
                });
                job.setMetrics(metrics);
            }

            if (ai.getStartedAt() != null) job.setStartedAt(ai.getStartedAt());
            if (ai.getFinishedAt() != null) job.setFinishedAt(ai.getFinishedAt());
            if (ai.getError() != null) job.setError(ai.getError());
            if (ai.getResultPath() != null) job.setResultPath(ai.getResultPath());

            jobRepository.save(job);
        });
    }

    private JobStatus parseStatus(String s) {
        if (s == null) return JobStatus.PENDING;
        try {
            return JobStatus.valueOf(s.toUpperCase());
        } catch (IllegalArgumentException ex) {
            return JobStatus.PENDING;
        }
    }

    private JobResponse toResponse(Job job) {
        return JobResponse.builder()
                .jobId(job.getJobId())
                .datasetName(job.getDatasetName())
                .modelName(job.getModelName())
                .totalEpochs(job.getTotalEpochs())
                .currentEpoch(job.getCurrentEpoch())
                .trainerType(job.getTrainerType())
                .status(job.getStatus())
                .metrics(job.getMetrics())
                .metricsHistory(job.getMetricsHistory())
                .createdAt(job.getCreatedAt())
                .startedAt(job.getStartedAt())
                .finishedAt(job.getFinishedAt())
                .error(job.getError())
                .resultPath(job.getResultPath())
                .build();
    }
}
