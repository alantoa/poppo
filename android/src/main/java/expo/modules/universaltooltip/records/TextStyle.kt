package expo.modules.universaltooltip.records
import android.graphics.Typeface
import android.os.Build
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

data class TextStyle(
    @Field var fontSize: Float = 13f,
    @Field var color: Int = -16777216,
    @Field var fontFamily: String? = null,
    @Field var fontWeight: String = "normal",
) : Record {

}

fun convertFontWeightToTypeface(fontWeight: String): Typeface {
    val numericWeight = when (fontWeight) {
        "normal" -> 400
        "bold" -> 700
        else -> fontWeight.toIntOrNull() ?: 400
    }
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        Typeface.create(Typeface.DEFAULT, numericWeight, false)
    } else {
        Typeface.create(
            Typeface.DEFAULT,
            if (numericWeight >= 600) Typeface.BOLD else Typeface.NORMAL,
        )
    }
}
