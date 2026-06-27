package org.itstec.report.service;

import java.util.List;
import java.util.Map;

import javax.servlet.http.HttpServletRequest;

import org.itstec.report.entity.Report;

public interface ReportService {

	public int addRep(Report report);
	
	public int updateRep(String doctorId, String userId, String dateTime, String subject, double sData);
	
	public int arch(String doctorId, String para);
	
	public List<Report> queryByUser(String userId);
	
	public String showSingleRep(String dateTime, String userId, String doctorId);
	
	public List<Report> querySubjScore(String doctorId, String dateTime, 
			String subject, String condition, double sData) throws Exception;
	
	public List<Report> queryCustOrder(String doctorId, String dateTime, 
			String subject, String condition, double sData, String order) throws Exception;
	
	public Map<String, Object>handle(HttpServletRequest request);
	
	public int queryCountUser(String doctorId, String dateTime, String subject);
	
}
