package org.dp_back.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class DatasetUploadResponse {
    private String datasetName;
    private String path;
    private long sizeBytes;
}
