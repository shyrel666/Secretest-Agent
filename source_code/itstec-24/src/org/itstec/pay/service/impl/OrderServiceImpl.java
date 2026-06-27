package org.itstec.pay.service.impl;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Date;
import java.util.List;
import java.util.Random;

import org.itstec.common.result.R;
import org.itstec.pay.entify.Order;
import org.itstec.pay.mapper.OrderMapper;
import org.itstec.pay.service.OrderService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

@Service
public class OrderServiceImpl implements OrderService {

    private Logger logger = LoggerFactory.getLogger(OrderServiceImpl.class);

    private OrderMapper orderMapper;

    public OrderServiceImpl(OrderMapper orderMapper){
        this.orderMapper = orderMapper;
    }

    @Override
    public R create(Order order) {
        R<Order> r = this.get(order);
        if(r.getData() != null){
            return R.code("201","订单已存在，请勿重复下单");
        }
        order.setPayStatus("0");
        order.setCreateTime(new Date());
        order.setUpdateTime(new Date());
        orderMapper.insert(order);
        return R.data(order);
    }

    @Override
    public R pay(Order order) {
        R<Order> r = this.get(order);
        if(r.getData() == null){
            return r;
        }
        if(!"0".equals(r.getData().getPayStatus())){
            return R.code("202","订单非待支付状态，请确认订单状态");
        }
        // 立减金额
        r.getData().setDiscountAmount(new Random().nextInt() + "");
        // 手续费
        String orderAmount = StringUtils.isEmpty(order.getOrderAmount()) ? r.getData().getOrderAmount() : order.getOrderAmount();
        BigDecimal orderAmountDec = new BigDecimal(orderAmount);
        BigDecimal orderFeeRuleDec = new BigDecimal("0.01");
        r.getData().setOrderFee(orderAmountDec.multiply(orderFeeRuleDec).toString());
        r.getData().setPayStatus(order.getPayStatus());
        r.getData().setPayTime(new Date());
        r.getData().setUpdateTime(new Date());
        orderMapper.updateById(r.getData());
        return r;
    }

    @Override
    public R notify(Order order) {
        R<Order> r = this.get(order);
        if(r.getData() == null){
            return r;
        }
        String msg = "";
        try{
            String s="http://101.101.101.101:8081//order/getById?orderNo="+order.getOrderNo();
            URL url = new URL(s);
            HttpURLConnection connection = ( HttpURLConnection) url.openConnection();
            // 设置请求方式
            connection.setRequestMethod("POST");
            // 连接
            connection.connect();
            // 得到响应状态码的返回值 responseCode
            int code = connection.getResponseCode();
            // 如果返回值正常，数据在网络中是以流的形式得到服务端返回的数据
            if (code == 200) { // 正常响应
                // 从流中读取响应信息
                BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()));
                String line = null;
                while ((line = reader.readLine()) != null) { // 循环从流中读取
                    msg += line + "\n";
                }
            }
            // 断开连接，释放资源
            connection.disconnect();
        }catch (Exception e){

        }
        logger.info("进行通知，订单信息:[{}],通知地址:[{}],通知结果：[{}]",r.getData(),r.getData().getNotifyUrl(),msg);
        return R.data(msg);
    }

    @Override
    public R get(Order order) {
        QueryWrapper<Order> orderQueryWrapper = new QueryWrapper<>();
        orderQueryWrapper.lambda().eq(Order::getOrderNo,order.getOrderNo());
        Order orderDb = orderMapper.selectOne(orderQueryWrapper);
        if(orderDb == null){
            return R.code("201","订单不存在");
        }
        return R.data(orderDb);
    }

    @Override
    public R getByIdCardNo(Order order) {
        QueryWrapper<Order> orderQueryWrapper = new QueryWrapper<>();
        orderQueryWrapper.lambda().eq(Order::getIdCardNo,order.getIdCardNo());
        Order orderDb = orderMapper.selectOne(orderQueryWrapper);
        if(orderDb == null){
            return R.code("201","订单不存在");
        }
        return R.data(orderDb);
    }

    @Override
    public List<Order> export(String beginTime,String endTime) {
        QueryWrapper<Order> orderQueryWrapper = new QueryWrapper<>();
        orderQueryWrapper.lambda().between(Order::getPayTime,beginTime,endTime);
        List<Order> orderList = orderMapper.selectList(orderQueryWrapper);
        if(!CollectionUtils.isEmpty(orderList)){
            orderList.forEach(e -> {
                if("0".equals(e.getPayType())){
                    e.setPayType("支付宝");
                }else{
                    e.setPayType("微信");
                }
                if("0".equals(e.getPayStatus())){
                    e.setPayType("待支付");
                }else if("1".equals(e.getPayStatus())){
                    e.setPayType("支付成功");
                }else if("2".equals(e.getPayStatus())){
                    e.setPayType("支付失败");
                }
            });
        }
        return orderList;
    }

    @Override
    public IPage<?> exportByPage(Integer page,Integer pageSize) {
        IPage<Order> orderPage = new Page<>(page,pageSize);
        return orderMapper.selectPage(orderPage,null);
    }
}
