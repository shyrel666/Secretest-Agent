package org.itstec.doctor.service;

import java.util.List;

import org.itstec.report.entity.Report;
import org.itstec.user.entity.User;
import org.itstec.doctor.entity.Doctor;

public interface DoctorService {
	
	public String register(String account, String name, String pwd);
	
	public String login(String account, String pwd);
	
	public int updateInfo(Doctor doctor);
	
	public String modifyPwd(String account, String oriPwd, String newPwd);
	
	public List<User> queryUserList(String account);
	
	public List<Report> queryUserReport(String account, String userId);
	
	public List<String> showArchFile(String account, String dCode);
	
}
