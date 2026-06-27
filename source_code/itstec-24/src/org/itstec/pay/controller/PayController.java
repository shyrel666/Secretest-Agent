package org.itstec.pay.controller;

import org.itstec.common.crytodec.CryptoDecryptionSignSecurity;
import org.itstec.common.json.JsonUtil;
import org.itstec.common.result.R;
import org.itstec.pay.entify.Order;
import org.itstec.pay.service.OrderService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;


@RestController
@RequestMapping("/order")
public class PayController {

    @Autowired
    private OrderService orderService;

    /**
     * 下单
     * @param order
     * @return
     */
    @CryptoDecryptionSignSecurity
    @PostMapping(value = "/create")
    public R create(Order order){
        return orderService.create(order);

    }

    /**
     * 支付接口
     * @param order
     * @return
     */
    @CryptoDecryptionSignSecurity
    @PostMapping(value = "/pay")
    public R pay(Order order){
        return orderService.pay(order);
    }

    /**
     * 通知接口
     * @param order
     * @return
     */
    @PostMapping(value = "/notify")
    public R notify(Order order){
        return orderService.notify(order);
    }

    /**
     * 查询订单
     * @param order
     * @return
     */
    @PostMapping(value = "/getById")
    public R getById(Order order){
        return orderService.get(order);
    }

    /**
     * 查询订单-根据身份证号查询订单
     * @param order
     * @return
     */
    @CryptoDecryptionSignSecurity(requestDecryption=false,requestSign=false,partialCrySign = {"idCardNo"})
    @PostMapping(value = "/getByIdCardNo")
    public R getByIdCardNo(Order order){
        return orderService.getByIdCardNo(order);
    }

    /**
     * 按页导出订单
     * @param page
     * @param pageSize
     * @return
     */
    @PostMapping(value = "/exportByPage")
    public R exportByPage(Integer page,Integer pageSize){
        return R.data(JsonUtil.toJson(orderService.exportByPage(page,pageSize).getRecords()).getBytes());
    }

    /**
     * 按时间段导出订单
     * @param beginTime
     * @param endTime
     * @return
     */
    @GetMapping(value = "/exportByTime")
    public R exportByTime(String beginTime, String endTime) {
        return R.data(JsonUtil.toJson(orderService.export(beginTime,endTime)).getBytes());
    }
}
