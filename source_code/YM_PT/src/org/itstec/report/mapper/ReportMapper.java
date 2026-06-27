package org.itstec.report.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.itstec.report.entity.Report;
import org.itstec.user.entity.User;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;

@Mapper
public interface ReportMapper extends BaseMapper<User>{

	int addRep(Report report);
	
	int updateRep(@Param("doctorId") String doctorId, @Param("userId") String userId, 
			@Param("dateTime") String dateTime, 
			@Param("subject") String subject, @Param("sData") double sData);
	
	List<Report> queryByUser(@Param("userId") String userId);
	
	List<Report> queryRep(@Param("dateTime") String dateTime, @Param("userId") String userId);
	
	Report queryRepByDoctor(@Param("dateTime") String dateTime, 
			@Param("userId") String userId, @Param("doctorId") String doctorId);
	
	List<Report> querySubjData(@Param("doctorId") String doctorId, @Param("dateTime") String dateTime, 
			@Param("subject") String subject, @Param("condition") String condition, @Param("sData") double sData);

	List<Report> queryCustOrder(@Param("doctorId") String doctorId, @Param("dateTime") String dateTime, 
			@Param("subject") String subject, @Param("condition") String condition, @Param("sData") double sData, @Param("order") String order);

	int queryCountUser(@Param("doctorId") String doctorId, @Param("dateTime") String dateTime, @Param("subject") String subject);
	
}
