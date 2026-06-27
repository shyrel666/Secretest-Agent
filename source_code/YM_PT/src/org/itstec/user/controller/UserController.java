package org.itstec.user.controller;

import java.util.HashMap;
import java.util.Map;

import javax.servlet.http.Cookie;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import org.itstec.user.entity.User;
import org.itstec.user.service.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.databind.ObjectMapper;

@SuppressWarnings("unchecked")
@RestController
public class UserController {

	private static Logger logger = LoggerFactory.getLogger(UserController.class);
	
	private final UserService service;
	
	@Autowired
	UserController(UserService service){
		this.service=service;
	}
	
	@PostMapping(value = "/user/login")
    public String login(HttpServletRequest request) {

		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String userId = (String) decryptedData.get("userId");
		String pwd = (String) decryptedData.get("pwd");
		String page = (String) decryptedData.get("page");
		
		HttpSession session = request.getSession();
		String result = service.login(userId, pwd);
		if("登录成功".equals(result)) {
			session.invalidate();
			session = request.getSession();
			session.setMaxInactiveInterval(-1);
			session.setAttribute("userId", userId);
			return "redirect:" + page;
		}else {
			return "redirect:/user/loginInit"; 
		}    	
    	
    }
	
	@PostMapping(value = "/user/modifyPwd")
	public Map<String, Object> modifyPwd(HttpServletRequest request) {
		
		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String userId = (String) decryptedData.get("userId");
		String pwd = (String) decryptedData.get("pwd");
		String newPwd = (String) decryptedData.get("newPwd");
		
		Map<String, Object> data = new HashMap<>();
		if(checkLogin(request, userId)) {
			String result = service.modifyPwd(userId, pwd, newPwd);
			data.put("result", result);
		}else {
			data.put("result", "请先登录");
		}
    	
        return data;
    }
	
	@PostMapping(value = "/user/updateInfo")
	public Map<String, Object> updateInfo(HttpServletRequest request) {

		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		User user = convertJsonToObject((String)decryptedData.get("user"), User.class);
		
		Map<String, Object> data = new HashMap<>();
		if(checkLogin(request,user.getUserId())) {
			int i = service.updateInfo(user);
			if(i>0) {
				data.put("result", "更新成功");
			}else {
				data.put("result", "更新失败");
			}
		}else {
			data.put("result", "请先登录");
		}
		
        return data;
    }
	
	@PostMapping(value = "/updatePic")
    public Map<String, Object> updatePic(HttpServletRequest request, 
    		@RequestParam("pic") MultipartFile pic, @RequestParam("userId") String userId){
        
		Map<String, Object> data = new HashMap<>();
		if (pic.isEmpty() || pic.getSize() > 5 * 1024 * 1024) {
			data.put("result", "请检查图片");
			return data;
		}

		if(checkLogin(request,userId)) {
			int i = service.updatePic(userId, pic);
			if(i == 0) {
				data.put("result", "更新图片成功");
			}else {
				data.put("result", "更新图片失败");
			}
			
		}else {
			data.put("result", "请先登录");
		}
		
        return data;
    }
	
	@PostMapping(value = "/user/showUser")
	public Map<String, Object> showUser(HttpServletRequest request, HttpServletResponse response) {
		
		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String userId = (String) decryptedData.get("userId");
		
		Map<String, Object> data = new HashMap<>();
		if(checkLogin(request, userId)) {
			User user = service.show(userId);
			data.put("result", user);
			Cookie cPhone =new Cookie("userPhone",user.getUserPhone());
			cPhone.setMaxAge(-1);
			cPhone.setHttpOnly(true);
			cPhone.setSecure(true);
			response.addCookie(cPhone);
			Cookie cAddress =new Cookie("userAddress",user.getUserAddress());
			cAddress.setMaxAge(60);
			cAddress.setHttpOnly(true);
			cAddress.setSecure(true);
			response.addCookie(cAddress);
		}else {
			data.put("result", "请先登录");
		}
		HttpSession session = request.getSession();
		session.setAttribute("userId", userId);
    	
        return data;
    }
	
	@PostMapping(value = "/user/selectDoctor")
	public Map<String, Object> selectDoctor(HttpServletRequest request) {
		
		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String userId = (String) decryptedData.get("userId");
		String doctorID = (String) decryptedData.get("doctorID");
		
		Map<String, Object> data = new HashMap<>();
		if(checkLogin(request, userId)) {
			String result = service.selectDoctor(userId, doctorID);
			data.put("result", result);
		}else {
			data.put("result", "请先登录");
		}
    	
        return data;
    }
	
	private boolean checkLogin(HttpServletRequest request, String userId) {
		HttpSession session = request.getSession();
		String sess = (String) session.getAttribute("userId");
		if(sess != null && sess.equals(userId)) {
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
