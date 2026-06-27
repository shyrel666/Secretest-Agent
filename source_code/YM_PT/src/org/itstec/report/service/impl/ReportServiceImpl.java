package org.itstec.report.service.impl;

import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.servlet.http.HttpServletRequest;

import org.itstec.report.entity.Report;
import org.itstec.report.mapper.ReportMapper;
import org.itstec.report.service.ReportService;
import org.itstec.user.entity.User;
import org.itstec.user.mapper.UserMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class ReportServiceImpl implements ReportService{

	private Logger logger = LoggerFactory.getLogger(ReportServiceImpl.class);
	
	private final ReportMapper rMapper;
	private final UserMapper sMapper;
	
	@Autowired
	public ReportServiceImpl(ReportMapper rMapper, UserMapper sMapper) {
		this.rMapper = rMapper;
		this.sMapper = sMapper;
	}
	
	@Override
	public int addRep(Report report) {
		int i = -1;
		if(checkReport(report)) {
			List<Report> check = rMapper.queryRep(report.getDateTime(), report.getUserId());
			if(check.isEmpty() ) {
				i = rMapper.addRep(report);
			}else {
				i = -99;
			}
		}

		return i;
	}

	@Override
	public int updateRep(String doctorId, String userId, String dateTime, String subject, double sData) {
		int i = -1;
		if(checkSubject(subject) && checkData(sData)) {
			i = rMapper.updateRep(doctorId, userId, dateTime, subject, sData);
		}
		
		return i;
	}

	@Override
	public int arch(String id, String para) {
		int i =- 1;
		String[] cmd = new String[3];
		cmd[0] = "C:\\Windows\\System32\\cmd.exe";
		cmd[1] = "/c";
		cmd[2] = "D:/itstec/arch.bat";
		try {
			cmd[2]=cmd[2]+" "+para;
			Process process = Runtime.getRuntime().exec(cmd);
			i = execute(process.getInputStream());
		} catch (Exception e) {
			logger.error("归档程序异常");
			return i;
		}
		return i;
	}
	
	@Override
	public List<Report> queryByUser(String userId) {
		List<Report> list = null;
		list = rMapper.queryByUser(userId);
		return list;
	}
	
	@Override
	public String showSingleRep(String dateTime, String userId, String doctorId) {
		String content = "无报告单";
		Report tmp = new Report();

		tmp.setUserId(userId);
		if(checkReport(tmp)) {
			Report report = rMapper.queryRepByDoctor(dateTime, userId, doctorId);
			content = "血压："+report.getBloodPressure()+"<br>";
			content += "血糖："+report.getBloodSugar()+"<br>";
			content += "血脂："+report.getBloodLipids()+"<br>";
		}else {
			content = "请检查输入参数";
		}
		
		return content;
	}
	
	@Override
	public List<Report> querySubjScore(String doctorId, String dateTime, 
			String subject, String condition, double sData) throws Exception{
		List<Report> list = null;
		if(checkSubject(subject) && checkCond(condition) && checkData(sData)) {
			list = rMapper.querySubjData(doctorId, dateTime, subject, condition, sData);
		}
		return list;
	}

	@Override
	public List<Report> queryCustOrder(String doctorId, String dateTime, String subject, 
			String condition, double sData, String order) throws Exception{
		List<Report> list = null;
		if(checkSubject(subject) && checkCond(condition) && checkData(sData)) {
			list = rMapper.queryCustOrder(doctorId, dateTime, subject, condition, sData, order);
		}
		return list;
	}

	@Override
	public Map<String, Object> handle(HttpServletRequest request) {
		// 自定义操作 在需要的业务实现类中实现
		return new HashMap<>();
	}
	
	@Override
	public int queryCountUser(String doctorId, String dateTime, String subject) {
		int count = 0;
		if(checkSubject(subject) ) {
			count = rMapper.queryCountUser(doctorId, dateTime, subject);
		}
		return count;
	}

	private boolean checkReport(Report report) {
		if("".equals(report.getUserId())) {
			return false;
		}else {
			User stu = sMapper.show(report.getUserId());
			if (stu == null) {
				return false;
			}
		}
		if(!checkData(report.getBloodPressure())) {return false;}
		if(!checkData(report.getBloodSugar())) {return false;}
		if(!checkData(report.getBloodLipids())) {return false;}
		
		return true;
	}
	
	private boolean checkData(double score) {
		if(score>=0 && score<=500) {
			return true;
		}else {
			return false;
		}
	}
	
	private boolean checkSubject(String subject) {
		if("bloodPressure".equals(subject) || "bloodSugar".equals(subject) || "bloodLipids".equals(subject)) {
			return true;
		}else {
			return false;
		}
	}
	
	private boolean checkCond(String condition) {
		if(">".equals(condition) || "=".equals(condition) || "<".equals(condition)) {
			return true;
		}else {
			return false;
		}
	}
	
	private static int execute(final InputStream input) {
		//执行归档程序 略
		return 0;
	}

}
