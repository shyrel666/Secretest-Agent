package org.itstec.admin.service;

import org.itstec.doctor.entity.Doctor;
import org.springframework.web.multipart.MultipartFile;

public interface AdminService {

	public String login(String account, String pwd);
	
	public int addDoctor(Doctor doctor);
	
	public int addBatchDoctor(String account, String docIds, String docNames, int docNum) throws Exception;
	
	public int importDoctor(String account, int doctorNum, MultipartFile excel);

}
