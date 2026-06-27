package org.itstec.admin.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.itstec.admin.entity.Admin;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;

@Mapper
public interface AdminMapper  extends BaseMapper<Admin>{

	Admin login(@Param("account") String account, @Param("pwd") String pwd);
	
}
