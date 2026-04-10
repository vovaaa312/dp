package org.dp_back.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AiTrainRequest {

    @JsonProperty("dataset_path")
    private String datasetPath;

    @JsonProperty("model_name")
    private String modelName;

    private int epochs;
    private int imgsz;
    private int batch;

    @JsonProperty("run_name")
    private String runName;

    @JsonProperty("trainer_type")
    private String trainerType;

    @JsonProperty("results_dir")
    private String resultsDir;

    @JsonProperty("resume_from")
    private String resumeFrom;
}
