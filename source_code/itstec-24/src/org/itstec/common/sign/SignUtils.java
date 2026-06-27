package org.itstec.common.sign;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.StringUtils;

import java.security.MessageDigest;
import java.util.*;

/**
 * @description: 签名工具
 */
public class SignUtils {

    private static Logger logger = LoggerFactory.getLogger(SignUtils.class);

    public static String signA(Map<String, String> data, String key) {

        String unsignString = "";
        List<String> nameList = new ArrayList<String>(data.keySet());
        Collections.sort(nameList);
        Iterator<String> var5 = nameList.iterator();

        while(var5.hasNext()) {
            String name = (String)var5.next();
            String value = String.valueOf(data.get(name));
            if (!StringUtils.isEmpty(value) && !"null".equals(value.trim()) && !"sign".equals(name)) {
                unsignString = unsignString + name + "=" + value + "&";
            }
        }

        unsignString = unsignString + "key=" + key;
        logger.info("按照顺序计算签名前串:{}",unsignString);
        String resp = md5(unsignString);
        if(StringUtils.isEmpty(resp)){
            return null;
        }
        logger.info("平台计算签名 :[{}]",resp.toUpperCase());
        return resp.toUpperCase();
    }

    public static String signB(Map<String, String[]> data, String key) {

        String unsignString = "";
        List<String> nameList = new ArrayList<String>(data.keySet());
        Collections.sort(nameList);
        Iterator<String> var5 = nameList.iterator();

        while(var5.hasNext()) {
            String name = (String)var5.next();
            String value = data.get(name)[0];
            if (!StringUtils.isEmpty(value) && !"null".equals(value.trim().toLowerCase()) && !"sign".equals(name)) {
                unsignString = unsignString + name + "=" + value + "&";
            }
        }

        unsignString = unsignString + "key=" + key;
        logger.info("按照顺序计算签名前串:{}",unsignString);
        String resp = md5(unsignString);
        if(StringUtils.isEmpty(resp)){
            return null;
        }
        logger.info("平台计算签名 :[{}]",resp.toUpperCase());
        return resp.toUpperCase();
    }

    public static String md5(String value){
        try{
            MessageDigest mdInst = MessageDigest.getInstance("MD5");
            mdInst.update(value.getBytes("UTF-8"));
            byte[] arr = mdInst.digest();
            StringBuffer sb = new StringBuffer();

            for(int i = 0; i < arr.length; ++i) {
                sb.append(Integer.toHexString(arr[i] & 255 | 256).substring(1, 3));
            }
            return sb.toString();
        }catch (Exception e){
            logger.error("计算签名md5失败");
            return null;
        }
    }
}
