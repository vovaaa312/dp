package org.dp_back.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.dp_back.model.dto.AiJobStatusResponse;
import org.dp_back.model.dto.AiTrainRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiClientService {

    private final RestTemplate restTemplate;

    @Value("${ai.service.base-url:http://localhost:8000}")
    private String aiBaseUrl;

    public boolean startTraining(AiTrainRequest request) {
        String url = aiBaseUrl + "/train";
        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(url, request, Map.class);
            return response.getStatusCode().is2xxSuccessful();
        } catch (Exception ex) {
            log.error("Failed to start training job on AI service: {}", ex.getMessage());
            throw new RuntimeException("AI service unreachable: " + ex.getMessage(), ex);
        }
    }

    public Optional<AiJobStatusResponse> getJobStatus(String jobId) {
        String url = aiBaseUrl + "/train/" + jobId;
        try {
            AiJobStatusResponse response = restTemplate.getForObject(url, AiJobStatusResponse.class);
            return Optional.ofNullable(response);
        } catch (HttpClientErrorException ex) {
            if (ex.getStatusCode() == HttpStatus.NOT_FOUND) {
                return Optional.empty();
            }
            log.error("Error fetching job status from AI service for job {}: {}", jobId, ex.getMessage());
            return Optional.empty();
        } catch (Exception ex) {
            log.error("AI service unreachable when fetching status for job {}: {}", jobId, ex.getMessage());
            return Optional.empty();
        }
    }

    public boolean stopJob(String jobId) {
        String url = aiBaseUrl + "/train/" + jobId;
        try {
            restTemplate.delete(url);
            return true;
        } catch (Exception ex) {
            log.error("Failed to stop job {} on AI service: {}", jobId, ex.getMessage());
            return false;
        }
    }

    public Map<?, ?> runInference(String imagePath, String modelPath, double conf) {
        String url = aiBaseUrl + "/predict/by-path";
        Map<String, Object> body = Map.of(
                "image_path", imagePath,
                "model_path", modelPath,
                "conf", conf
        );
        try {
            return restTemplate.postForObject(url, body, Map.class);
        } catch (Exception ex) {
            log.error("Inference request to AI service failed: {}", ex.getMessage());
            throw new RuntimeException("Inference failed: " + ex.getMessage(), ex);
        }
    }

    public Optional<String> getJobLogs(String jobId) {
        String url = aiBaseUrl + "/train/" + jobId + "/logs?lines=500";
        try {
            String logs = restTemplate.getForObject(url, String.class);
            return Optional.ofNullable(logs);
        } catch (HttpClientErrorException ex) {
            if (ex.getStatusCode() == HttpStatus.NOT_FOUND) {
                return Optional.empty();
            }
            log.error("Error fetching logs for job {}: {}", jobId, ex.getMessage());
            return Optional.empty();
        } catch (Exception ex) {
            log.error("AI service unreachable when fetching logs for job {}: {}", jobId, ex.getMessage());
            return Optional.empty();
        }
    }

    public boolean isHealthy() {
        try {
            restTemplate.getForObject(aiBaseUrl + "/health", Map.class);
            return true;
        } catch (Exception ex) {
            return false;
        }
    }
}
