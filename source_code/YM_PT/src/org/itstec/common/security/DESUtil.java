package org.itstec.common.security;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class DESUtil {

	private static Logger logger = LoggerFactory.getLogger(DESUtil.class);
	
    private static final String DES = "DES";
    private static final String key = "5gQ2QXcB7FQ=";

    /**
     * DES加密
     *
     * @param data 待加密数据
     * @param key  密钥字符串
     * @return 加密后的Base64编码字符串
     * @throws Exception
     */
    public static String encrypt(String data) {
        byte[] keyBytes = fromBase64(key);
        SecretKeySpec secretKeySpec = new SecretKeySpec(keyBytes, DES);
        Cipher cipher;
        byte[] encryptedData = null;
		try {
			cipher = Cipher.getInstance(DES);
			cipher.init(Cipher.ENCRYPT_MODE, secretKeySpec);
	        encryptedData = cipher.doFinal(data.getBytes());
		} catch (Exception e) {
			logger.error("DAES加密异常:"+e.getMessage());
		}
        return toBase64(encryptedData);
    }

    /**
     * DES解密
     *
     * @param data 待解密数据的Base64编码字符串
     * @param key  密钥字符串
     * @return 解密后的字符串
     * @throws Exception
     */
    public static String decrypt(String data) {
        byte[] keyBytes = fromBase64(key);
        SecretKeySpec secretKeySpec = new SecretKeySpec(keyBytes, DES);
        Cipher cipher;
        byte[] decryptedData = null;
        try {
          cipher = Cipher.getInstance(DES);
          cipher.init(Cipher.DECRYPT_MODE, secretKeySpec);
          byte[] decodedData = fromBase64(data);
          decryptedData = cipher.doFinal(decodedData);
        } catch (Exception e) {
        	logger.error("DAES解密异常:"+e.getMessage());
		}
        return new String(decryptedData);
    }

    /**
     * 将字节数组转换为Base64编码的字符串
     *
     * @param bytes 字节数组
     * @return Base64编码的字符串
     */
    public static String toBase64(byte[] bytes) {
        return Base64.getEncoder().encodeToString(bytes);
    }

    /**
     * 将Base64编码的字符串解码为字节数组
     *
     * @param base64String Base64编码的字符串
     * @return 字节数组
     */
    public static byte[] fromBase64(String base64String) {
        return Base64.getDecoder().decode(base64String);
    }

}
