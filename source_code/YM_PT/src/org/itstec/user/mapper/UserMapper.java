package org.itstec.user.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.itstec.user.entity.User;

@Mapper
public interface UserMapper extends BaseMapper<User>{

	int regiest(@Param("userId") String userId, @Param("pwd") String pwd, 
			@Param("userName") String userName );
	
	User login(@Param("userId") String userId, @Param("pwd") String pwd);
	
	int updatePwd(@Param("userId") String userId, @Param("pwd") String pwd, @Param("newPwd") String newPwd);
	
	int updateInfo(User user);
	
	User show(@Param("userId") String userId);
	
	int updateDoctor(@Param("userId") String userId, @Param("doctorID") String doctorID);
	
}
