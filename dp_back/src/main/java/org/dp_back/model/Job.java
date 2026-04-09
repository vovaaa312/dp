package org.dp_back.model;

import jakarta.persistence.*;
import lombok.*;
import org.dp_back.model.converter.MetricsConverter;
import org.dp_back.model.converter.MetricsHistoryConverter;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "jobs")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Job {

    @Id
    private String jobId;

    private String datasetName;
    private String modelName;
    private int totalEpochs;
    private int currentEpoch;
    private String trainerType;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private JobStatus status = JobStatus.PENDING;

    @Convert(converter = MetricsConverter.class)
    @Column(columnDefinition = "TEXT")
    private Map<String, Double> metrics;

    @Convert(converter = MetricsHistoryConverter.class)
    @Column(columnDefinition = "TEXT")
    private List<Map<String, Object>> metricsHistory;

    private Instant createdAt;
    private Instant startedAt;
    private Instant finishedAt;

    private String error;
    private String resultPath;

    // FK to users table — no JPA relation to keep it simple
    private Long userId;
}
