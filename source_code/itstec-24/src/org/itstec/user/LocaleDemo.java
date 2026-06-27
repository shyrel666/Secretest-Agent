package org.itstec.user;

import java.util.Locale;

public class LocaleDemo {

	public static void main(String[] args) {
		// create a new locale
	      Locale locale1 = new Locale("ENGLISH", "US");

	      // print this locale
	      System.out.println("Locale1:" + locale1);

	      // create a second locale
	      Locale locale2 = new Locale("GERMANY", "US");
	      System.out.println("Locale2:" + locale2);
	      // compare two locales
	      System.out.println("Locales are equal:" + locale1.equals(locale2));

	      // create a third locale
	      Locale locale3 = new Locale("ENGLISH", "US");

	      // compare locale1 and locale3
	      System.out.println("Locales are equal:" + locale1.equals(locale3));

	}

}
