package org.itstec.pay.entify;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;

import java.util.Date;

@TableName("t_order")
public class Order {

//  @ExcelIgnore
  private long id;
//  @ExcelProperty("订单号")
  private String orderNo;
//  @ExcelProperty("姓名")
  private String name;
//  @ExcelProperty("身份证号")
  private String idCardNo;
//  @ExcelProperty("订单金额")
  private String orderAmount;
//  @ExcelProperty("订单优惠金额")
  private String discountAmount;
//  @ExcelProperty("订单手续费")
  private String orderFee;
  // 支付类型，0：支付宝，1：微信
//  @ExcelProperty("支付类型")
  private String payType;
  // 支付状态；0：待支付，1：支付成功，2：支付失败
//  @ExcelProperty("支付状态")
  private String payStatus;
//  @ExcelProperty("通知地址")
  private String notifyUrl;
  @JsonFormat(pattern="yyyy-MM-dd HH:mm:ss",timezone = "GMT+8")
//  @ExcelProperty("支付时间")
  private Date payTime;
  @JsonFormat(pattern="yyyy-MM-dd HH:mm:ss",timezone = "GMT+8")
//  @ExcelProperty("创建时间")
  private Date createTime;
//  @ExcelIgnore
  @JsonFormat(pattern="yyyy-MM-dd HH:mm:ss",timezone = "GMT+8")
  private Date updateTime;


  public long getId() {
    return id;
  }

  public void setId(long id) {
    this.id = id;
  }


  public String getOrderNo() {
    return orderNo;
  }

  public void setOrderNo(String orderNo) {
    this.orderNo = orderNo;
  }


  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getIdCardNo() {
    return idCardNo;
  }

  public void setIdCardNo(String idCardNo) {
    this.idCardNo = idCardNo;
  }

  public String getOrderFee() {
    return orderFee;
  }

  public void setOrderFee(String orderFee) {
    this.orderFee = orderFee;
  }

  public String getOrderAmount() {
    return orderAmount;
  }

  public void setOrderAmount(String orderAmount) {
    this.orderAmount = orderAmount;
  }

  public String getDiscountAmount() {
    return discountAmount;
  }

  public void setDiscountAmount(String discountAmount) {
    this.discountAmount = discountAmount;
  }

  public String getPayType() {
    return payType;
  }

  public void setPayType(String payType) {
    this.payType = payType;
  }


  public String getPayStatus() {
    return payStatus;
  }

  public void setPayStatus(String payStatus) {
    this.payStatus = payStatus;
  }


  public Date getPayTime() {
    return payTime;
  }

  public void setPayTime(Date payTime) {
    this.payTime = payTime;
  }


  public Date getCreateTime() {
    return createTime;
  }

  public void setCreateTime(Date createTime) {
    this.createTime = createTime;
  }


  public Date getUpdateTime() {
    return updateTime;
  }

  public void setUpdateTime(Date updateTime) {
    this.updateTime = updateTime;
  }

  public String getNotifyUrl() {
    return notifyUrl;
  }

  public void setNotifyUrl(String notifyUrl) {
    this.notifyUrl = notifyUrl;
  }
}
