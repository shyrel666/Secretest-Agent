package org.itstec.pay.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.itstec.pay.entify.Order;

@Mapper
public interface OrderMapper extends BaseMapper<Order> {

}
