package org.itstec.user.service.impl;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.itstec.common.security.DESUtil;
import org.itstec.common.security.SHA256Util;
import org.itstec.user.entity.User;
import org.itstec.user.mapper.UserMapper;
import org.itstec.user.service.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class UserServiceImpl implements UserService{

	private static Logger logger = LoggerFactory.getLogger(UserServiceImpl.class);
	
	private final UserMapper mapper;
	
	@Autowired
    public UserServiceImpl(UserMapper mapper) {
        this.mapper = mapper;
    }
	
	@Override
	public String login(String userId, String pwd) {
		String result = "登录失败";
		if(pwd.length()>20) {
			return result;
		}
		if(checkUserId(userId)) {
			pwd = SHA256Util.sha256(pwd + userId);
			User user = mapper.login(userId, pwd);
			if(user == null) {
				result = "登录失败";
			}else {
				result = "登录成功";
			}
		}else {
			result = "登录失败";
		}
		
		return result;
	}
	
	@Override
	public String modifyPwd(String userId, String oriPwd, String newPwd) {
		String result = "修改失败";
		if(oriPwd.length()>20 || newPwd.length()>20) {
			return result;
		}
		oriPwd = SHA256Util.sha256(oriPwd + userId);
		newPwd = SHA256Util.sha256(newPwd + userId);
		int i = mapper.updatePwd(userId, oriPwd, newPwd);
		if(i > 0) {
			result = "修改成功";
		}else {
			result = "修改失败";
		}
		
		return result;
	}
	
	@Override
	public User show(String userId) {
		User user = mapper.show(userId);
		if(user != null) {
			String phone = DESUtil.decrypt(user.getUserPhone());
			logger.info("phone:{}",phone);
			String regex = "^(\\d{3})\\d{4}(\\d{4})$";
			user.setUserPhone(phone.replaceAll(regex, "$1****$2"));
			String address = DESUtil.decrypt(user.getUserAddress());
			user.setUserAddress(address);
		}
		return user;
	}

	@Override
	public int updateInfo(User user) {
		int i;
		if(checkInfo(user)) {
			String phone = user.getUserPhone();
			if(logger.isDebugEnabled()) {
				logger.debug("original phone:{}",phone);
			}
			phone = DESUtil.encrypt(phone);
			if(logger.isDebugEnabled()) {
				logger.debug("encrypt phone:{}",phone);
			}
			user.setUserPhone(phone);
			String address = user.getUserAddress();
			address = DESUtil.encrypt(address);
			user.setUserAddress(address);
			i = mapper.updateInfo(user);
		}else {
			i = -1;
		}
		
		return i;
	}

	@Override
	public int updatePic(String userId, MultipartFile pic) {
		String picPath = "D:/itstec/pic/";
		
		String fileName = pic.getOriginalFilename();
		String suffix = fileName.substring(fileName.lastIndexOf("."));
		String[] picSuffixList = { ".jpg", ".png", ".jpeg", ".gif", ".bmp", ".ico" };
		boolean suffixFlag = false;
		for (String white_suffix : picSuffixList) {
			if (suffix.toLowerCase().equals(white_suffix)) {
				suffixFlag = true;
				break;
			}
		}
		if (!suffixFlag) {
			logger.error("图片格式（后缀名）非法:{}", suffix);
			return -1;
		}
		
		if(checkUserId(userId)) {
			delFilesWithSameName(picPath, userId);
			String filePath = picPath + userId + suffix;
			try {
				byte[] bytes = pic.getBytes();
				Path path = Paths.get(filePath);
				Files.write(path, bytes);
				return 0;
			} catch (IOException e) {
				logger.error("图片写入异常："+e.getMessage());
				return -2;
			}
		}else {
			return -1;
		}
		
	}

	@Override
	public String selectDoctor(String userId, String doctorID) {
		String result = "更新失败";

		int i = mapper.updateDoctor(userId, doctorID);
		if(i < 0) {
			result = "更新失败";
		}else {
			result = "更新成功";
		}
		
		return result;
	}
	
	private boolean checkUserId(String userId) {
		String regex = "^[0-9]{1,20}$";
		return userId.matches(regex);
	}
	
	private boolean checkInfo(User user) {
		if (!"".equals(user.getUserName())) {
			String name = user.getUserName();
			String regex = "^[\u4e00-\u9fa5·]{1,10}$";
			if (!name.matches(regex)) {
				return false;
			}
		}

		if (!"".equals(user.getUserPhone())) {
			String phone = user.getUserPhone();
			String regex = "^\\d{11}$";
			if (!phone.matches(regex)) {
				return false;
			}
		}

		if (!"".equals(user.getUserAddress())) {
			String address = user.getUserAddress();
			if (address.length() > 200) {
				return false;
			}
		}
		
		return true;
	}
	
	private static void delFilesWithSameName(String directoryPath, String fileName) {
        File directory = new File(directoryPath);
        File[] files = directory.listFiles(); 
        if (files != null) {
            for (File file : files) {
                String baseName = file.getName();
                int dotIndex = baseName.lastIndexOf(".");
                if (dotIndex > 0) {
                    baseName = baseName.substring(0, dotIndex);
                }
                if (baseName.equals(fileName) && file.isFile()) {
                    if (file.delete()) {
                    	logger.info("File deleted: " + file.getName());
                    } else {
                    	logger.info("Failed to delete file: " + file.getName());
                    }
                }
            }
        }
    }

}
