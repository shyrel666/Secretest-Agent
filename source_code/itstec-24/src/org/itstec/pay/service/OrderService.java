package org.itstec.pay.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import org.itstec.common.result.R;
import org.itstec.pay.entify.Order;

import java.io.IOException;
import java.net.MalformedURLException;
import java.util.List;

public interface OrderService {

    /**
     * 下单
     * @param order
     * @return
     */
    R create(Order order);

    /**
     * 支付接口
     * @param order
     * @return
     */
    R pay(Order order);

    /**
     * 通知接口
     * @param order
     * @return
     */
    R notify(Order order);

    /**
     * 查询订单
     * @param order
     * @return
     */
    R get(Order order);
    /**
     * 查询订单
     * @param order
     * @return
     */
    R getByIdCardNo(Order order);

    /**
     * 按时间段导出订单
     * @param beginTime
     * @param endTime
     * @return
     */
    List<Order> export(String beginTime, String endTime);

    /**
     * 按页导出订单
     * @param pageSize 
     * @return
     */
    IPage exportByPage(Integer page, Integer pageSize);
}
