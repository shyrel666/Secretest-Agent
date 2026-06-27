package org.itstec.common.result;

import java.io.Serializable;

public class R<T> implements Serializable {

    private String code;
    private String msg;
    private T data;

    public R(String code, String msg){
        this.msg = msg;
        this.code = code;
    }

    public R(String code, T data, String msg){
        this.msg = msg;
        this.code = code;
        this.data = data;
    }

    public static <T> R<T> code(String code,String msg) {
        return new R<>(code,msg);
    }

    public static <T> R<T> data(T data) {
        return new R<>("200", data, "成功");
    }

    public static <T> R<T> data(String code, T data, String msg) {
        return new R<>(code, data, msg);
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getMsg() {
        return msg;
    }

    public void setMsg(String msg) {
        this.msg = msg;
    }

    public T getData() {
        return data;
    }

    public void setData(T data) {
        this.data = data;
    }
}
