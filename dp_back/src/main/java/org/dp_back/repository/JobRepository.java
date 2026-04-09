package org.dp_back.repository;

import org.dp_back.model.Job;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface JobRepository extends JpaRepository<Job, String> {
    List<Job> findByUserIdOrderByCreatedAtDesc(Long userId);
    Optional<Job> findByJobIdAndUserId(String jobId, Long userId);
}
