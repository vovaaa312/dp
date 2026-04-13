package org.dp_back.configuration;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.dp_back.model.Role;
import org.dp_back.model.User;
import org.dp_back.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class AdminSeeder implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        if (userRepository.findByUsername("admin").isEmpty()) {
            User admin = User.builder()
                    .username("admin")
                    .email("admin@dp.local")
                    .password(passwordEncoder.encode("adminadmin"))
                    .role(Role.ADMIN)
                    .build();
            userRepository.save(admin);
            log.info("Created default admin user: admin / adminadmin");
        }
    }
}
