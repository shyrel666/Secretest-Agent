package org.itstec.common.crytodec;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;


@Documented
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface CryptoDecryptionSignSecurity {

    /**
     * 是否加解密，默认加解密
     *
     * @return
     */
    boolean cryptoDecryption() default true;

    /**
     * 是否进行request请求 解密，默认进行解密
     *
     * @return
     */
    boolean requestDecryption() default true;

    /**
     * 是否对response输出结果进行加密，默认进行加密
     *
     * @return
     */
    boolean responseCrypto() default true;

    /**
     * 是否进行request 验签，默认进行验签
     *
     * @return
     */
    boolean requestSign() default true;

    /**
     * 是否进行response 加签，默认进行加签
     *
     * @return
     */
    boolean responseSign() default true;

    /**
     * 对部分字段进行加密验签
     * @return
     */
    String[] partialCrySign() default {};

}
