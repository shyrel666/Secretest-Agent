package org.itstec.report.controller;

import java.lang.reflect.Constructor;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.servlet.http.Cookie;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import org.itstec.report.entity.Report;
import org.itstec.report.service.ReportService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.ObjectMapper;

@SuppressWarnings("unchecked")
@RestController
public class ReportController {

	private static Logger logger = LoggerFactory.getLogger(ReportController.class);
	private final ReportService service;
	
	@Autowired
	ReportController(ReportService service){
		this.service=service;
	}
	
	@PostMapping(value = "/report/addRep")
    public Map<String, Object> addRep(HttpServletRequest request) {
		
		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		Report report = convertJsonToObject((String)decryptedData.get("report"), Report.class);
		
		String doctorID = report.getDoctorId();
		Map<String, Object> data = new HashMap<>();
		if(checkDoctorLogin(request, doctorID)) {
			int i = service.addRep(report);
			if(i > 0) {
				data.put("result", "添加成功");
			}else {
				if(i == -99) {
					data.put("result", "已有此报告，请修改");
				}else {
					data.put("result", "添加失败");
				}
			}
		}else {
			data.put("result", "请先登录");
		}
    	
        return data;
    }
	
	@PostMapping(value = "/report/updateRep")
    public Map<String, Object> updateRep(HttpServletRequest request) {
		
		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String doctorID = (String) decryptedData.get("doctorID");
		String userId = (String) decryptedData.get("userId");
		String dateTime = (String) decryptedData.get("dateTime");
		String subject = (String) decryptedData.get("subject");
		double sData = (double) decryptedData.get("sData");
				
		Map<String, Object> data = new HashMap<>();
		if(checkDoctorLogin(request, doctorID)) {
			int i = service.updateRep(doctorID, userId, dateTime, subject, sData);
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
	
	@PostMapping(value = "/report/arch")
    public Map<String, Object> arch(HttpServletRequest request) {
		
		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String doctorID = (String) decryptedData.get("doctorID");
		String para = (String) decryptedData.get("para");
		
		Map<String, Object> data = new HashMap<>();
		if(checkDoctorLogin(request, doctorID)) {
			int i = service.arch(doctorID, para);
			if(i == 0) {
				data.put("result", "归档成功");
			}else {
				data.put("result", "归档失败");
			}
		}else {
			data.put("result", "请先登录");
		}
    	
        return data;
    }
	
	@PostMapping(value = "/report/queryByUser")
    public Map<String, Object> queryByUser(HttpServletRequest request, HttpServletResponse response) {
        
		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String userId = (String) decryptedData.get("userId");
		
		Cookie cookie =new Cookie("userId", userId);
		cookie.setHttpOnly(true);
		cookie.setSecure(true);
		response.addCookie(cookie);
		
		Map<String, Object> data = new HashMap<>();
		if(checkUserLogin(request, userId)) {
			List<Report> reports = service.queryByUser(userId);
			data.put("result", reports);
		}else {
			data.put("result", "请先登录");
		}
    	
        return data;
    }
	
	@PostMapping(value = "/single/showRep")
	public ResponseEntity<String> showRep(HttpServletRequest request) {
		
		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String doctorID = (String) decryptedData.get("doctorID");
		String userId = (String) decryptedData.get("userId");
		String dateTime = (String) decryptedData.get("dateTime");
		String charSet = (String) decryptedData.get("charSet");
		
		String content = "<head><meta http-equiv=\"Content-Type\" content=\"text/html;charset="+charSet+"\"></head>";
		if(checkDoctorLogin(request, doctorID)) {
			content += service.showSingleRep(dateTime, userId, doctorID);
		}else {
			content += "请先登录";
		}
		HttpHeaders headers = new HttpHeaders();
		headers.add("Content-Type", "text/html; charset="+charSet);
		return ResponseEntity
        		.ok()
        		.headers(headers)
        		.body(content);		
    }
	
	@PostMapping(value = "/report/querySubjScore")
    public Map<String, Object> querySubjScore(HttpServletRequest request) {
        
		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String doctorID = (String) decryptedData.get("doctorID");
		String dateTime = (String) decryptedData.get("dateTime");
		String subject = (String) decryptedData.get("subject");
		String condition = (String) decryptedData.get("condition");
		double sData = (double) decryptedData.get("sData");
		
		Map<String, Object> data = new HashMap<>();
		if(checkDoctorLogin(request, doctorID)) {
			try {
				List<Report> reports = service.querySubjScore(doctorID, dateTime, subject, condition, sData);
				data.put("result", reports);
			}catch(Exception e) {
				data.put("result", e.getMessage());
			}
		}else {
			data.put("result", "请先登录");
		}
    	
        return data;
    }
	
	@PostMapping(value = "/report/queryCustOrder")
    public Map<String, Object> queryCustOrder(HttpServletRequest request) {
        
		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String doctorID = (String) decryptedData.get("doctorID");
		String dateTime = (String) decryptedData.get("dateTime");
		String subject = (String) decryptedData.get("subject");
		String condition = (String) decryptedData.get("condition");
		double sData = (double) decryptedData.get("sData");
		String order = (String) decryptedData.get("order");
		
		Map<String, Object> data = new HashMap<>();
		if(checkDoctorLogin(request, doctorID)) {
			try {
				List<Report> reports = service.queryCustOrder(doctorID, dateTime, subject, condition, sData, order);
				data.put("result", reports);
			}catch(Exception e) {
				data.put("result", e.getMessage());
			}
		}else {
			data.put("result", "请先登录");
		}
    	
        return data;
    }
	
	@PostMapping(value = "/report/custom")
    public Map<String, Object> custom(HttpServletRequest request){
    	
		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String cName = (String) decryptedData.get("cName");
		
		Map<String, Object> data = new HashMap<>();
    	try {
			Class<?> clazz = Class.forName(cName);
			Constructor<?> constructor = clazz.getConstructor();
			ReportService obj = (ReportService)constructor.newInstance();
			Map<String, Object> result = obj.handle(request);
			data.put("result", result);
		} catch (Exception e) {
			data.put("result", "调用异常");
		}
        return data;
    }
	
	@PostMapping(value = "/report/queryCountUser")
    public Map<String, Object> queryCountUser(HttpServletRequest request) {
        
		Map<String, Object> decryptedData=(Map<String, Object>) request.getAttribute("decryptedData");
		String doctorID = (String) decryptedData.get("doctorID");
		String dateTime = (String) decryptedData.get("dateTime");
		String subject = (String) decryptedData.get("subject");
		
		Map<String, Object> data = new HashMap<>();
		if(checkDoctorLogin(request, doctorID)) {
			try {
				int count = service.queryCountUser(doctorID, dateTime, subject);
				data.put("result", count);
			}catch(Exception e) {
				data.put("result", e.getMessage());
			}
		}else {
			data.put("result", "请先登录");
		}
    	
        return data;
    }
	
	private boolean checkDoctorLogin(HttpServletRequest request, String teacherID) {
		HttpSession session = request.getSession();
		String sess = (String) session.getAttribute("doctorID");
		if(sess != null && sess.equals(teacherID)) {
			return true;
		}else {
			return false;
		}
	}
	
	private boolean checkUserLogin(HttpServletRequest request, String stuNo) {
		HttpSession session = request.getSession();
		String sess = (String) session.getAttribute("userId");
		if(sess != null && sess.equals(stuNo)) {
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
