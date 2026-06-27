package org.itstec.admin.service.impl;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import org.itstec.admin.entity.Admin;
import org.itstec.admin.mapper.AdminMapper;
import org.itstec.admin.service.AdminService;
import org.itstec.common.DateUtil;
import org.itstec.common.Poi4Util;
import org.itstec.common.security.AESUtil;
import org.itstec.common.security.SHA256Util;
import org.itstec.doctor.entity.Doctor;
import org.itstec.doctor.mapper.DoctorMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class AdminServiceImlp implements AdminService{

	private Logger logger = LoggerFactory.getLogger(AdminServiceImlp.class);
	
	private final AdminMapper aMapper;
	private final DoctorMapper dMapper;
	
	@Autowired
	public AdminServiceImlp(AdminMapper aMapper, DoctorMapper dMapper) {
		this.aMapper = aMapper;
		this.dMapper = dMapper;
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
		pwd = SHA256Util.sha256(pwd);

		Admin admin = aMapper.login(account, pwd);
		if (admin != null && !admin.getAccount().equals("")) {
			return result;
		} else {
			result = "登录成功";
		}

		return result;
	}
	
	@Override
	public int addDoctor(Doctor doctor) {
		int i = -1;
		if (!checkDoctor(doctor)) {
			return i;
		}
		Doctor tmp = dMapper.show(doctor.getAccount());
		if (tmp != null) {
			return -99;
		}
		UUID uuid = UUID.randomUUID();
		String id = "d" + uuid.toString();
		String pwd = AESUtil.encrypt(doctor.getAccount());
		i = dMapper.regiest(id, doctor.getAccount(), doctor.getDocName(), pwd);

		return i;
	}

	@Override
	@Transactional(rollbackFor = Exception.class)
	public int addBatchDoctor(String account, String docIds, String docNames, int docNum) throws Exception {
		int i = 0;
		if(docNum <= 0) {
			return -1;
		}
		if(docIds == null || docNames == null) {
			return -1;
		}
		if(docIds.length() > 500) {
			return -1;
		}
		String[] docId = docIds.split(",");
		String[] docName = docNames.split(",");
		Doctor doc = new Doctor();
		String pwd = "";
		for(int j = 0; j < docNum; j++) {
			doc = new Doctor();
			doc.setAccount(docId[j]);
			doc.setDocName(docName[j]);
			if (!checkDoctor(doc)) {
				throw new Exception("检查异常");
			}
			UUID uuid = UUID.randomUUID();
			String id = "D" + uuid.toString();
			pwd = AESUtil.encrypt(doc.getAccount());
			int t = dMapper.regiest(id, doc.getAccount(), doc.getDocName(), pwd);
			if (t <= 0) {
				return -1;
			} else {
				i++;
			}
		}
		return i;
	}

	@Override
	@Transactional(rollbackFor = Exception.class)
	public int importDoctor(String account, int doctorNum, MultipartFile excel) {
		int i = 0;

		Path path = null;
		String tmpPath = "D:/itstec/tmp/";
		String tmp = DateUtil.getDateTimeStr();
		try {
			byte[] bytes = excel.getBytes();
			path = Paths.get(tmpPath + tmp + ".xlsx");
			Files.write(path, bytes);
		} catch (IOException e) {
			logger.error("上传文件异常");
			return -1;
		}

		List<Doctor> doctors = null;
		try {
			if(doctorNum <= 0) {
				return -1;
			}
			doctors = readStuExcel(path.toFile(), doctorNum);
			if ( doctors == null || doctors.isEmpty() ) {
				return -1;
			}
		} catch (Exception e) {
			logger.error("读取Excel异常");
			return -1;
		}
		path.toFile().delete();

		for (int j = 0; j < doctors.size(); j++) {
			Doctor doctor = doctors.get(j);
			UUID uuid = UUID.randomUUID();
			String id = "D" + uuid.toString();
			String pwd = AESUtil.encrypt(doctor.getAccount());
			int t = dMapper.regiest(id, doctor.getAccount(), doctor.getDocName(), pwd);
			if (t <= 0) {
				return -1;
			} else {
				i++;
			}
		}

		return i;
	}

	private static boolean checkAccount(String account) {
		if ("".equals(account)) {
			return false;
		}
		if (account.length() > 30 || account.length() < 0) {
			return false;
		}
		String regex = "^[A-Za-z0-9_]*$";
		if (account.matches(regex)) {
			return true;
		} else {
			return false;
		}
	}
	
	private List<Doctor> readStuExcel(File excel, int docNum) throws Exception {
		Poi4Util poi;
		FileInputStream is = null;
		Doctor[] doctorsArray = new Doctor[docNum];
		List<Doctor> tmp = new ArrayList<>(Arrays.asList(doctorsArray));
		List<Doctor> doctors = new ArrayList<>();
		try {
			is = new FileInputStream(excel.getAbsolutePath());

			poi = new Poi4Util(is, "xlsx", "Sheet1");

			for (int i = 1; i <= 1000; i++) {
				if ("".equals(poi.getCellStringValue(i, 0))) {
					break;
				}
				
				Doctor doctor = new Doctor();
				doctor.setAccount(poi.getCellStringValue(i, 1));
				doctor.setDocName(poi.getCellStringValue(i, 2));
				if (!checkDoctor(doctor)) {
					return null;
				}
				Doctor stu = dMapper.show(doctor.getAccount());
				if (stu != null) {
					return null;
				}
				doctors.add(doctor);	
				tmp.add(doctor);
			}
		} catch (Exception e) {
			logger.error("读取excel异常");
			throw e;
		} finally {
			if (is != null) {
				is.close();
			}
		}
		return doctors;
	}
	

	private boolean checkDoctor(Doctor doctor) {
		if (!"".equals(doctor.getAccount())) {
			String account = doctor.getAccount();
			String regex = "^[0-9]{1,20}$";
			if (!account.matches(regex)) {
				return false;
			}
		}	
		if (!"".equals(doctor.getDocName())) {
			String name = doctor.getDocName();
			String regex = "^[\u4e00-\u9fa5·]{1,10}$";
			if (!name.matches(regex)) {
				return false;
			}
		}
		return true;
	}
	
}
