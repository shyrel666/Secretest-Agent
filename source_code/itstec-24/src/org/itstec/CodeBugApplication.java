package org.itstec;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.web.servlet.ServletComponentScan;

@ServletComponentScan
@SpringBootApplication
@MapperScan({"org.itstec.**.mapper.**"})
public class CodeBugApplication {

    public static void main(String[] args) {
        SpringApplication.run(CodeBugApplication.class, args);
    }

}
