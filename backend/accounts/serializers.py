import base64
import binascii
from io import BytesIO
import warnings

from PIL import Image, ImageOps
from .models import Profile
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers


def profile_data(user):
    profile = getattr(user, "profile", None)
    return {
        "display_name": profile.display_name if profile else "",
        "nickname": profile.nickname if profile else "",
        "status": profile.status if profile else "",
        "status_emoji": profile.status_emoji if profile else "",
        "avatar": "data:image/jpeg;base64," + base64.b64encode(bytes(profile.avatar)).decode() if profile and profile.avatar else None,
    }


class UserSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(max_length=80, allow_blank=True, required=False)
    nickname = serializers.CharField(max_length=40, allow_blank=True, required=False)
    status = serializers.CharField(max_length=120, allow_blank=True, required=False)
    status_emoji = serializers.CharField(max_length=16, allow_blank=True, required=False)
    avatar = serializers.CharField(allow_null=True, required=False, max_length=2800000)

    class Meta:
        model = User
        fields = ["id", "username", "email", "display_name", "nickname", "status", "status_emoji", "avatar"]
        read_only_fields = ["id", "username", "email"]

    def to_representation(self, user):
        return {"id": user.pk, "username": user.username, "email": user.email,
                "email_verified": hasattr(user, "recovery_email"), **profile_data(user)}

    def validate_avatar(self, value):
        if value is None:
            return None
        try:
            prefix, encoded = value.split(",", 1)
            if prefix not in ("data:image/jpeg;base64", "data:image/png;base64", "data:image/webp;base64"):
                raise ValueError()
            raw = base64.b64decode(encoded, validate=True)
            if len(raw) > 2 * 1024 * 1024:
                raise ValueError()
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(BytesIO(raw)) as image:
                    if image.format not in ("JPEG", "PNG", "WEBP") or image.width * image.height > 16000000:
                        raise ValueError()
                    image = ImageOps.exif_transpose(image).convert("RGB")
                    image = ImageOps.fit(image, (256, 256))
                    output = BytesIO()
                    image.save(output, format="JPEG", quality=85)
            return output.getvalue()
        except (ValueError, binascii.Error, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise serializers.ValidationError("Choose a valid JPEG, PNG, or WebP photo under 2 MB and 16 megapixels.")

    def update(self, user, validated_data):
        profile, _ = Profile.objects.get_or_create(user=user)
        for field, value in validated_data.items():
            setattr(profile, field, value)
        profile.save()
        return user


class RegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=256)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        user = User(username=attrs["username"], email=attrs.get("email", ""))
        try:
            validate_password(attrs["password"], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": exc.messages})
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)
