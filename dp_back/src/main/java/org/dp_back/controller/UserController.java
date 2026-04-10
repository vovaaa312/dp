package org.dp_back.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.dp_back.model.dto.AuthResponse;
import org.dp_back.model.dto.ChangeUsernameRequest;
import org.dp_back.service.AuthService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.Map;

@RestController
@RequestMapping("/api/user")
@RequiredArgsConstructor
public class UserController {

    private final AuthService authService;

    @PutMapping("/username")
    public ResponseEntity<?> changeUsername(
            @Valid @RequestBody ChangeUsernameRequest request,
            Principal principal
    ) {
        try {
            AuthResponse response = authService.changeUsername(principal.getName(), request.getNewUsername());
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", ex.getMessage()));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", ex.getMessage()));
        }
    }
}
