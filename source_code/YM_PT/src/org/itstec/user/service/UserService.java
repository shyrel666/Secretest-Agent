package org.itstec.user.service;

import org.itstec.user.entity.User;
import org.springframework.web.multipart.MultipartFile;

public interface UserService {

	public String login(String userId, String pwd);
	
	public String modifyPwd(String userId, String oriPwd, String newPwd);
	
	public User show(String userId);
	
	public int updateInfo(User user);
	
	public int updatePic(String userId, MultipartFile pic);
	
	public String selectDoctor(String userId, String doctorID);
	
}
