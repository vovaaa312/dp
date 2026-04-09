package org.dp_back.model.converter;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Map;

@Converter(autoApply = true)
public class MetricsConverter implements AttributeConverter<Map<String, Double>, String> {

    @Override
    public String convertToDatabaseColumn(Map<String, Double> attribute) {
        if (attribute == null) return null;
        try {
            return new ObjectMapper().writeValueAsString(attribute);
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    @Override
    public Map<String, Double> convertToEntityAttribute(String dbData) {
        if (dbData == null) return null;
        try {
            return new ObjectMapper().readValue(dbData, new TypeReference<Map<String, Double>>() {});
        } catch (Exception e) {
            return null;
        }
    }
}
