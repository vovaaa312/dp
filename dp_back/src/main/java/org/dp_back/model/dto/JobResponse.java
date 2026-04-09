package org.dp_back.model.dto;

import lombok.Builder;
import lombok.Data;
import org.dp_back.model.JobStatus;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Data
@Builder
public class JobResponse {

    private String jobId;
    private String datasetName;
    private String modelName;
    private int totalEpochs;
    private int currentEpoch;
    private String trainerType;
    private JobStatus status;

    private Map<String, Double> metrics;
    private List<Map<String, Object>> metricsHistory;

    private Instant createdAt;
    private Instant startedAt;
    private Instant finishedAt;

    private String error;
    private String resultPath;
}
