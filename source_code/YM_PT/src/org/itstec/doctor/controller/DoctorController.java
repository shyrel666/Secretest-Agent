package org.itstec.doctor.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import org.itstec.report.entity.Report;
import org.itstec.user.entity.User;
import org.itstec.doctor.entity.Doctor;
import org.itstec.doctor.service.DoctorService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.ObjectMapper;

@SuppressWarnings("unchecked")
@RestController
public class DoctorController {
	
	private static Logger logger = LoggerFactory.getLogger(DoctorController.class);

	private final DoctorService service;
	
	@Autowired
	DoctorController(DoctorService service){
		this.service = service;
	}
	
	@PostMapping(value = "/doctor/register")
    public Map<String, Object> register(HttpServletRequest request) {
        
		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String account = (String) decryptedData.get("account");
		String name = (String) decryptedData.get("name");
		String pwd = (String) decryptedData.get("pwd");
		
		String result = service.register(account, name, pwd);
		if("注册成功".equals(result)) {
			HttpSession session = request.getSession(true);
			session.setAttribute("doctorID", account);
		}
    	
    	Map<String, Object> data = new HashMap<>();
    	data.put("result", result);
    	
        return data;
    }
		
	
	@PostMapping(value = "/doctor/login")
    public Map<String, Object> login(HttpServletRequest request, HttpServletResponse response) {
		
		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String account = (String) decryptedData.get("account");
		String pwd = (String) decryptedData.get("pwd");
		
		String result = service.login(account, pwd);
		if("登录成功".equals(result)) {
			HttpSession session = request.getSession(true);
			session.setAttribute("doctorID", account);
		}
		    	
    	Map<String, Object> data = new HashMap<>();
    	data.put("result", result);
    	
        return data;
    }
	
	@PostMapping(value = "/doctor/updateInfo")
    public Map<String, Object> updateInfo(HttpServletRequest request) {

		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		Doctor doctor = convertJsonToObject((String)decryptedData.get("doctor"), Doctor.class);
		
		Map<String, Object> data = new HashMap<>();
		if(doctor!=null && checkLogin(request, doctor.getAccount())) {
			int i = service.updateInfo(doctor);
			if(i > 0) {
				data.put("result", "更新成功");
			}else {
				data.put("result", "更新失败");
			}
			
		}else {
			data.put("result", "请先登录");
		}
		
        return data;
    }
	
	@PostMapping(value = "/doctor/modifyPwd")
	public Map<String, Object> modifyPwd(HttpServletRequest request) {
		
		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String account = (String) decryptedData.get("account");
		String pwd = (String) decryptedData.get("pwd");
		String newPwd = (String) decryptedData.get("newPwd");
		
		Map<String, Object> data = new HashMap<>();
		if(checkLogin(request, account)) {
			String result = service.modifyPwd(account, pwd, newPwd);
			data.put("result", result);
		}else {
			data.put("result", "请先登录");
		}
    	
        return data;
    }
	
	@PostMapping(value = "/doctor/queryUserList")
    public Map<String, Object> queryUserList(HttpServletRequest request) {

		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String account = (String) decryptedData.get("account");
		
		Map<String, Object> data = new HashMap<>();
		List<User> users = service.queryUserList(account);
		data.put("result", users);
		
        return data;
    }
	
	@PostMapping(value = "/doctor/queryUserReport")
    public Map<String, Object> queryUserReport(HttpServletRequest request) {

		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String account = (String) decryptedData.get("account");
		String userId = (String) decryptedData.get("userId");
		
		Map<String, Object> data = new HashMap<>();
		if(checkLogin(request, account)) {
			List<Report> reports = service.queryUserReport(account, userId);
			data.put("result", reports);
		}else {
			data.put("result", "请先登录");
		}
		
        return data;
    }
	
	@PostMapping(value = "/doctor/showArchFile")
    public Map<String, Object> showArchFile(HttpServletRequest request) {

		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String account = (String) decryptedData.get("account");
		String dCode = (String) decryptedData.get("dCode");
		
		Map<String, Object> data = new HashMap<>();
		if(checkLogin(request, account)) {
			List<String> files = service.showArchFile(account, dCode);
			data.put("result", files);
		}else {
			data.put("result", "请先登录");
		}
		
        return data;
    }
	
	private boolean checkLogin(HttpServletRequest request, String doctorID) {
		HttpSession session = request.getSession();
		String sess = (String) session.getAttribute("doctorID");
		if(sess != null && sess.equals(doctorID)) {
			return true;
		}else {
			return false;
		}
	}
	
	private static <T> T convertJsonToObject(String json, Class<T> clazz) {
        ObjectMapper mapper = new ObjectMapper();
        try {
            return mapper.readValue(json, clazz);
        } catch (Exception e) {
        	logger.error("转换异常:"+e.getMessage());
            return null;
        }
    }
	
}
