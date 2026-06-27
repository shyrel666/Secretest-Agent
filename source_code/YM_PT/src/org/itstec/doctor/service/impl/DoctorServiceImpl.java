package org.itstec.doctor.service.impl;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.itstec.common.security.AESUtil;
import org.itstec.common.security.SecUtil;
import org.itstec.report.entity.Report;
import org.itstec.user.entity.User;
import org.itstec.doctor.entity.Doctor;
import org.itstec.doctor.mapper.DoctorMapper;
import org.itstec.doctor.service.DoctorService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class DoctorServiceImpl implements DoctorService {

	private final DoctorMapper dMapper;

	@Autowired
	public DoctorServiceImpl(DoctorMapper dMapper) {
		this.dMapper = dMapper;
	}

	@Override
	public String register(String account, String name, String pwd) {
		String result = "注册失败";
		if (!checkAccount(account)) {
			return result;
		}
		Doctor doctor = dMapper.show(account);
		if (doctor != null && !doctor.getAccount().equals("")) {
			return result;
		}
		if ("0".equals(checkPwd(pwd))) {
			return result;
		}
		pwd = AESUtil.encrypt(pwd);
		UUID uuid = UUID.randomUUID();
		String id = "d" + uuid.toString();
		int i = dMapper.regiest(id, account, name, pwd);
		if (i <= 0) {
			return result;
		} else {
			result = "注册成功";
		}

		return result;
	}

	@Override
	public String login(String account, String pwd) {
		String result = "登录失败";
		if (!checkAccount(account)) {
			return result;
		}
		if(pwd.length()>20) {
			return result;
		}
		pwd = AESUtil.encrypt(pwd);

		Doctor doctor = dMapper.login(account, pwd);
		if (doctor != null && !doctor.getAccount().equals("")) {
			return result;
		} else {
			result = "登录成功";
		}

		return result;
	}

	@Override
	public int updateInfo(Doctor doctor) {
		if (!checkDoctor(doctor)) {
			return 0;
		}
		String encrPhone = SecUtil.encrypt(doctor.getDocPhone());
		doctor.setDocPhone(encrPhone);
		String encrAddress = SecUtil.encrypt(doctor.getDocAddress());
		doctor.setDocAddress(encrAddress);

		return dMapper.updateInfo(doctor);
	}
	
	@Override
	public String modifyPwd(String account, String oriPwd, String newPwd) {
		String result = "修改失败";
		oriPwd = AESUtil.encrypt(oriPwd);
		newPwd = AESUtil.encrypt(newPwd);
		int i = dMapper.updatePwd(account, oriPwd, newPwd);
		if(i > 0) {
			result = "修改成功";
		}else {
			result = "修改失败";
		}
		
		return result;
	}

	@Override
	public List<User> queryUserList(String account) {
		return dMapper.queryUserList(account);
	}

	@Override
	public List<Report> queryUserReport(String account, String userId) {
		return dMapper.queryUserReport(userId);
	}
	
	@Override
	public List<String> showArchFile(String account, String dCode) {
		String dirPath = "D:/itstec/doctor/"+dCode;
	    List<String> fileNames = new ArrayList<>();
	    File dir = new File(dirPath);
	    if (dir.isDirectory()) {
	        File[] files = dir.listFiles();
	        if (files != null) {
	            for (File file : files) {
	                if (file.isFile()) {
	                    fileNames.add(file.getName());
	                }
	            }
	        }
	    }
	    
	    return fileNames;
	}

	private static boolean checkAccount(String account) {
		if ("".equals(account)) {
			return false;
		}
		if (account.length() > 20 || account.length() < 0) {
			return false;
		}
		String regex = "^[0-9]{1,20}$";
		if (account.matches(regex)) {
			return true;
		} else {
			return false;
		}
	}

	private static String checkPwd(String password) {
		String s = "0";
	    if ("".equals(password)) {
	        return "0";
	    }
	    if (password.length() < 8 || password.length() >= 20) {
	        return "0";
	    }
	    boolean hasBigLetter = false;
	    boolean hasSmallLetter = false;
	    boolean hasNumber = false;
	    boolean hasSpecialChar = false;

	    for (int i = 0; i < password.length(); i++) {
	        char c = password.charAt(i);
	        if (c >= 'A' && c <= 'Z') {
	            hasBigLetter = true;
	        } else if (c >= 'a' && c <= 'z') {
	            hasSmallLetter = true;
	        } else if (c >= '0' && c <= '9') {
	            hasNumber = true;
	        } else if ("!@#$%^&*".indexOf(c) != -1) {
	            hasSpecialChar = true;
	        }
	    }

	    if (hasBigLetter && hasSmallLetter 
	    		&& hasNumber && hasSpecialChar) {
	        s = "1";
	    } else {
	        s = "0";
	    }
	    return s;
	}
	
	private boolean checkDoctor(Doctor doctor) {
		if (!"".equals(doctor.getDocName())) {
			String name = doctor.getDocName();
			String regex = "^[\u4e00-\u9fa5·]{1,10}$";
			if (!name.matches(regex)) {
				return false;
			}
		}

		if (!"".equals(doctor.getDocPhone())) {
			String phone = doctor.getDocPhone();
			String regex = "^\\d{11}$";
			if (!phone.matches(regex)) {
				return false;
			}
		}

		if (!"".equals(doctor.getDocAddress())) {
			String address = doctor.getDocAddress();
			if (address.length() > 200) {
				return false;
			}
		}

		return true;
	}
	
}
