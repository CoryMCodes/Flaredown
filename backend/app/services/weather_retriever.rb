class WeatherRetriever
  class << self
    def get(date, postal_code)
      date = date.to_date
      position = Position.find_or_create_by(postal_code: postal_code)

      if position&.latitude.blank? || position&.longitude.blank?
        Rails.logger.warn "No coordinates found for postal_code #{postal_code}: #{position.inspect}"

        return
      end

      weather = Weather.find_by(date: date, position_id: position.id)

      return weather if weather.present?

      forecast = get_forecast(position)

      if forecast.status != 200
        Rails.logger.warn "No forecast found for position #{position.inspect}: response code was #{forecast.status}, headers were #{forecast.headers}, body contained #{forecast.body}"

        return
      end

      day = daily_forecast_on(forecast, date, position)

      if day.blank?
        Rails.logger.warn "No forecast for #{date} at position #{position.inspect}: the forecast endpoint only covers today onwards"

        return
      end

      create_weather(day, date, position.id)
    end

    private

    def get_forecast(position)
      Tomorrowiorb.forecast(
        "#{position.latitude},#{position.longitude}",
        ["1d"],
        "imperial"
      )
    end

    # The forecast endpoint takes no date: it always answers with a daily timeline
    # starting at the position's today. Pick out the day that was actually asked
    # for -- comparing dates in the position's own time zone, since the timeline
    # stamps each day in UTC -- so that the record we store is keyed by the date
    # the caller wanted and the cache above can find it again. Days outside the
    # window (a back-filled check-in, say) have no forecast to store.
    def daily_forecast_on(forecast, date, position)
      daily = JSON.parse(forecast.body, symbolize_names: true).dig(:timelines, :daily) || []
      time_zone = NearestTimeZone.to(position.latitude.to_f, position.longitude.to_f).presence || "UTC"

      daily.find { |day| local_date(day[:time], time_zone) == date }
    end

    def local_date(time, time_zone)
      Time.parse(time.to_s).in_time_zone(time_zone).to_date
    rescue ArgumentError
      nil
    end

    def create_weather(day, date, position_id)
      values = day.dig(:values)
      rain_intensity = values.dig(:rainIntensityAvg)
      sleet_intensity = values.dig(:sleetIntensityAvg)
      snow_intensity = values.dig(:snowIntensityAvg)
      icon = get_icon_legacy(values)
      summary = "General conditions are #{icon}, with an average temperature of #{values[:temperatureAvg]}."
      weather = Weather.new(
        date: date,
        humidity: values.dig(:humidityAvg).round,
        icon: icon,
        position_id: position_id,
        precip_intensity: rain_intensity + sleet_intensity + snow_intensity,
        pressure: values.dig(:pressureSurfaceLevelAvg),
        summary: summary,
        temperature_max: values.dig(:temperatureMax),
        temperature_min: values.dig(:temperatureMin)
      )

      return weather if weather.save

      Rails.logger.warn "Could not store weather for #{date} at position #{position_id}: #{weather.errors.full_messages.to_sentence}"

      # Another request cached this day while we were fetching it. Hand back the
      # record that won rather than an unsaved one, whose nil id callers would
      # store as "this check-in has no weather".
      Weather.find_by(date: date, position_id: position_id)
    end

    def get_icon_legacy(values)
      # Our icons do not coverage their full range of weather codes. We could pull in their icons (linked below) on the frontend to expand options
      # This method adapts their weather codes to our existing icons as best as possible
      # Icons and codes found here: https://docs.tomorrow.io/reference/data-layers-weather-codes
      # Icon files here: https://github.com/Tomorrow-IO-API/tomorrow-weather-codes
      # Daily forecast is always daytime weather codes / icons regardless of actual time
      # The forecast body is parsed with symbolized names, so these keys are symbols
      code = if values[:weatherCodeMin]
        values[:weatherCodeMin]
      elsif values[:weatherCodeFullDay]
        values[:weatherCodeFullDay]
      else
        values[:weatherCode]
      end

      case code
      when 1000, 1100
        "clear-day"
      when 1101
        "partly-cloudy-day"
      when 1102, 1001, 8000
        "cloudy"
      when 2000, 2100
        "fog"
      when 4000, 4001, 4200, 4201
        "rain"
      when 5000, 5001, 5100, 5101
        "snow"
      when 6000, 6001, 6200, 6201, 7000, 7101, 7102
        "sleet"
      else
        "default"
      end
    end
  end
end
