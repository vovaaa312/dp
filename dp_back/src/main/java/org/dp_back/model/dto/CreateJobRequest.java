package org.dp_back.model.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreateJobRequest {

    @NotBlank(message = "datasetName is required")
    private String datasetName;

    @NotBlank(message = "modelName is required")
    private String modelName;

    @Min(1) @Max(1000)
    private int epochs = 10;

    @Min(32) @Max(1920)
    private int imgsz = 640;

    @Min(1) @Max(256)
    private int batch = 8;

    private String trainerType = "mock";
}
