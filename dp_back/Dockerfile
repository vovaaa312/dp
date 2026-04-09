FROM maven:3.9-eclipse-temurin-17 AS build

WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q

COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:17-jre-jammy

WORKDIR /app
COPY --from=build /app/target/dp_back-0.0.1-SNAPSHOT.jar app.jar

ENV AI_BASE_URL=http://ai:8000 \
    DATA_DIR=/data \
    SERVER_PORT=8080

EXPOSE 8080

CMD ["java", "-jar", "app.jar"]
