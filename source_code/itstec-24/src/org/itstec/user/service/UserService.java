package org.itstec.user.service;

import java.io.File;

import javax.servlet.http.HttpServletRequest;

import org.itstec.common.result.R;
import org.itstec.user.entity.User;
import org.springframework.web.multipart.MultipartFile;

public interface UserService{

    R<?> register(HttpServletRequest request, User user);

    R<?> login(HttpServletRequest request, String username, String password);
    
    String loginAutoRedi(HttpServletRequest request, String username, String password, String url);
    
    R<?> logout(HttpServletRequest request, String username);
    
    R<?> query(HttpServletRequest request, String username);
    
    R<?> updateInfo(User user);
    
    R<?> uploadImg(MultipartFile img, String username);
    
    int updateBatchInfo(File excel);
    
    int importBatchInfo(File excel, int memorySize);
    
}
