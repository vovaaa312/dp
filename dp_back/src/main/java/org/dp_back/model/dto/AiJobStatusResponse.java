package org.dp_back.model.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class AiJobStatusResponse {

    @JsonProperty("job_id")
    private String jobId;

    private String status;

    @JsonProperty("current_epoch")
    private int currentEpoch;

    @JsonProperty("total_epochs")
    private int totalEpochs;

    private Map<String, Object> metrics;

    @JsonProperty("metrics_history")
    private List<Map<String, Object>> metricsHistory;

    @JsonProperty("started_at")
    private Instant startedAt;

    @JsonProperty("finished_at")
    private Instant finishedAt;

    private String error;

    @JsonProperty("result_path")
    private String resultPath;
}
