package org.itstec.user.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.itstec.user.entity.User;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserMapper extends BaseMapper<User> {

}
