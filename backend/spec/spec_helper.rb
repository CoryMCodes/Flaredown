require "simplecov"
SimpleCov.start

# This file is copied to spec/ when you run 'rails generate rspec:install'
ENV["RAILS_ENV"] ||= "test"

# Fixed values for the test suite, replacing what config/secrets.yml used to pin in
# its `test:` section. Set before the environment is loaded so the initializers see
# them, and set unconditionally so a developer's .env cannot change what the suite
# asserts on.
ENV["SMTP_EMAIL_FROM"] = "from@some.email"
ENV["SECRET_KEY_BASE"] ||= "c72c35331a3c6ab7e521ee57c867bdb2a081150064e16f7e83f9455f135d1efe72db2d7a7cc43ff9d671de3ae2afd17fc9aee9d823a695940f7f3cbca8c67116"

# Not a real key. Without it Devise::SecretKeyFinder walks its fallback chain at
# boot, and the second link in that chain reads `Rails.application.secrets`,
# which is deprecated. CI sets no DEVISE_SECRET_KEY and has no .env, so leaving
# this unset makes the suite fail once deprecations are raised.
ENV["DEVISE_SECRET_KEY"] ||= "c6ac1dd1b3e6cbbb3c2e7b2f9cf6f18f0f8bd6cd2e4a3a1e5b1c9f4a7d8e2b6c"

require File.expand_path("../../config/environment", __FILE__)
require "rspec/rails"

require "webmock/rspec"
WebMock.disable_net_connect!(allow_localhost: true)

Geocoder.configure(lookup: :test, ip_lookup: :test)
minneapolis_geo = {
  # match the WeatherRetriever vcr stub
  "coordinates" => [44.967486, -93.2897678],
  "address" => "Minneapolis, Minnesota, USA",
  "state" => "Minnesota",
  "state_code" => "MN",
  "country" => "United States",
  "country_code" => "US",
  "postal_code" => "55403"
}
Geocoder::Lookup::Test.set_default_stub([minneapolis_geo])

Dir[Rails.root.join("spec/support/**/*.rb")].each { |f| require f }

RSpec.configure do |config|
  config.use_transactional_fixtures = false

  config.expect_with :rspec
  config.mock_with :rspec

  config.include Devise::Test::ControllerHelpers, type: :controller

  config.infer_spec_type_from_file_location!

  config.before(:suite) do
    # TestEnv.init
  end
end

ActiveRecord::Migration.maintain_test_schema!
