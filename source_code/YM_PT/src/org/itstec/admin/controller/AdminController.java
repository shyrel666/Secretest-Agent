package org.itstec.admin.controller;

import java.util.HashMap;
import java.util.Map;

import javax.servlet.http.Cookie;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import org.itstec.admin.service.AdminService;
import org.itstec.doctor.entity.Doctor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@SuppressWarnings("unchecked")
@RestController
public class AdminController {

	private final AdminService service;
	
	@Autowired
	AdminController(AdminService service){
		this.service = service;
	}
	
	@PostMapping(value = "/admin/login")
    public Map<String, Object> login(HttpServletRequest request, HttpServletResponse response) {
		
		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String account = (String) decryptedData.get("account");
		String pwd = (String) decryptedData.get("pwd");
		
		String result = service.login(account, pwd);
		if("登录成功".equals(result)) {
			HttpSession session = request.getSession(true);
			session.setAttribute("adminID", account);
			Cookie cookie =new Cookie("adminID", account);
			response.addCookie(cookie);
		}
		    	
    	Map<String, Object> data = new HashMap<>();
    	data.put("result", result);
    	
        return data;
    }
	
	@PostMapping(value = "/admin/addDoctor")
    public Map<String, Object> addDoctor(HttpServletRequest request) {

		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String account = (String) decryptedData.get("account");
		String docId = (String) decryptedData.get("docId");
		String docName = (String) decryptedData.get("docName");
		
		Doctor doctor = new Doctor();
		doctor.setAccount(docId);
		doctor.setDocName(docName);
		String adminID = "";
		Cookie[] cookies = request.getCookies();
		if (cookies != null) {
		    for (Cookie cookie : cookies) {
		        if (cookie.getName().equals("adminID")) {
		        	adminID = cookie.getValue();
		        }
		    }
		}
		HttpSession session = request.getSession();
		session.setAttribute("doctor", doctor);
		Map<String, Object> data = new HashMap<>();
		if(account.equals(adminID)) {
			int i = service.addDoctor(doctor);
			if(i > 0) {
				data.put("result", "添加成功");
			}else {
				if(i == -99) {
					data.put("result", "已有此医生，无需重复添加");
				}else {
					data.put("result", "添加失败");
				}
			}
		}else {
			data.put("result", "请先登录");
		}
		
        return data;
    }
	
	@PostMapping(value = "/admin/addBatchDoctor")
    public Map<String, Object> addBatchDoctor(HttpServletRequest request ) {
		
		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String account = (String) decryptedData.get("account");
		String docIds = (String) decryptedData.get("docIds");
		String docNames = (String) decryptedData.get("docNames");
		int docNum = (int) decryptedData.get("docNum");
		
		Map<String, Object> data = new HashMap<>();
		if(checkLogin(request, account)) {
			int i;
			try {
				i = service.addBatchDoctor(account, docIds, docNames, docNum);
				if(i > 0) {
					data.put("result", "添加成功");
				}else {
					data.put("result", "添加失败");
				}
			} catch (Exception e) {
				data.put("result", "添加失败");
			}
		}else {
			data.put("result", "请先登录");
		}
		
        return data;
    }
	
	
	@PostMapping(value = "/importDoctor")
    public Map<String, Object> importDoctor(HttpServletRequest request, 
    		@RequestParam("account") String account, @RequestParam("docNum") int docNum,
    		@RequestParam("excel") MultipartFile excel){
        
		Map<String, Object> data = new HashMap<>();
		if (excel.isEmpty() || excel.getSize() > 5 * 1024 * 1024) {
			data.put("result", "请检查文件");
			return data;
		}
		
		if(checkLogin(request,account)) {
			int i = service.importDoctor(account, docNum, excel);
			if(i > 0) {
				data.put("result", "导入成功");
			}else {
				data.put("result", "导入失败");
			}
			
		}else {
			data.put("result", "请先登录");
		}
		
        return data;
    }
	
	private boolean checkLogin(HttpServletRequest request, String teacherID) {
		HttpSession session = request.getSession();
		String sess = (String) session.getAttribute("adminID");
		if(sess != null && sess.equals(teacherID)) {
			return true;
		}else {
			return false;
		}
	}
}
