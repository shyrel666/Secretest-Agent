package org.itstec;

import java.util.Locale;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.web.servlet.ServletComponentScan;

@ServletComponentScan
@SpringBootApplication
@MapperScan({"org.itstec.**.mapper.**"})
public class Application {

    public static void main(String[] args) {
    	Locale.setDefault(Locale.CHINESE);
        SpringApplication.run(Application.class, args);
    }

}
