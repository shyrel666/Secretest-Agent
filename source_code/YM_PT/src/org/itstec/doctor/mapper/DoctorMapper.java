package org.itstec.doctor.mapper;


import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.itstec.report.entity.Report;
import org.itstec.user.entity.User;
import org.itstec.doctor.entity.Doctor;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;

@Mapper
public interface DoctorMapper extends BaseMapper<Doctor>{

	int regiest(@Param("id") String id, @Param("account") String account, @Param("name") String name, @Param("pwd") String pwd);
	
	Doctor login(@Param("account") String account, @Param("pwd") String pwd);
	
	Doctor show(@Param("account") String account);
	
	int updateInfo(Doctor doctor);
	
	int updatePwd(@Param("account") String account, @Param("pwd") String pwd, @Param("newPwd") String newPwd);
	
	List<User> queryUserList(String account);
	
	List<Report> queryUserReport(String userId);
	
}
